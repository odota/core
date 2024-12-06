import moment from 'moment';
import config from '../config';
import db from '../store/db';
import redis from '../store/redis';
import cassandra from '../store/cassandra';
import { getRandomRetrieverUrl, redisCount } from '../util/utility';
import axios from 'axios';
import retrieverMatch from '../test/data/retriever_match.json';
import { insertMatch, upsertPlayer } from '../util/insert';
import { Archive } from '../store/archive';
import { MatchFetcher } from './base';

const blobArchive = config.ENABLE_BLOB_ARCHIVE ? new Archive('blob') : null;

/**
 * Return GC data by reading it without fetching.
 * @param matchId
 * @returns
 */
async function readGcData(
  matchId: number,
  noBlobStore: boolean | undefined,
): Promise<GcMatch | null> {
  let data = null;
  if (!noBlobStore) {
    const archive = await blobArchive?.archiveGet(`${matchId}_gcdata`);
    if (archive) {
      redisCount('blob_archive_read');
    }
    data = archive ? (JSON.parse(archive.toString()) as GcMatch) : null;
  }
  if (!data) {
    const result = await cassandra.execute(
      'SELECT gcdata FROM match_blobs WHERE match_id = ?',
      [matchId],
      { prepare: true, fetchSize: 1, autoPage: true },
    );
    const row = result.rows[0];
    data = row?.gcdata ? (JSON.parse(row.gcdata) as GcMatch) : null;
    if (data) {
      redisCount('gcdata_cassandra_read');
    }
  }
  if (
    data?.match_id == null ||
    data?.cluster == null ||
    data?.replay_salt == null
  ) {
    return null;
  }
  return data;
}

/**
 * Requests GC data from the retriever (optionally with retry) and saves it locally
 * @param job
 * @returns
 */
async function saveGcData(
  matchId: number,
  extraData: GcExtraData,
): Promise<string | null> {
  const url = await getRandomRetrieverUrl(`/match/${matchId}`);
  const { data, headers } = await axios.get<typeof retrieverMatch>(url, {
    timeout: 5000,
  });
  const steamid = headers['x-match-request-steamid'];
  const ip = headers['x-match-request-ip'];
  // Record the total steamids and ip counts (regardless of failure)
  redis.hincrby('retrieverSteamIDs', steamid, 1);
  redis.expireat(
    'retrieverSteamIDs',
    moment().startOf('day').add(1, 'day').format('X'),
  );
  redis.hincrby('retrieverIPs', ip, 1);
  redis.expireat(
    'retrieverIPs',
    moment().startOf('day').add(1, 'day').format('X'),
  );
  if (headers['x-match-noretry']) {
    // Steam is blocking this match for community prediction, so return error to prevent retry
    return 'x-match-noretry';
  }
  if (
    !data ||
    !data.match ||
    !data.match.players ||
    (!data.match.replay_salt && data.match.game_mode !== 'DOTA_GAMEMODE_NONE')
  ) {
    // Really old matches have a 0 replay salt so if we don't have gamemode either it's a valid response
    // Bad data but we can retry
    throw new Error('invalid data');
  }
  // Count successful calls
  redisCount('retriever');
  redis.hincrby('retrieverSuccessSteamIDs', steamid, 1);
  redis.expireat(
    'retrieverSuccessSteamIDs',
    moment().startOf('day').add(1, 'day').format('X'),
  );
  redis.hincrby('retrieverSuccessIPs', ip, 1);
  redis.expireat(
    'retrieverSuccessIPs',
    moment().startOf('day').add(1, 'day').format('X'),
  );
  const players = data.match.players.map(
    (p: any, i: number): GcPlayer => ({
      // NOTE: account ids are not anonymous in this call
      // Also, we probably want to queue a reconciliation job post-parse
      // to read back the match data and update all player_caches now that we have identity and parsed data
      // Maybe also want to do it after GC, and call it from fullhistory to update on request?
      account_id: p.account_id,
      player_slot: p.player_slot,
      party_id: Number(p.party_id),
      permanent_buffs: p.permanent_buffs ?? [],
      party_size: data.match.players.filter(
        (matchPlayer: any) =>
          Number(matchPlayer.party_id) === Number(p.party_id),
      ).length,
      // If we want to start adding basic data for anonymous players in player_caches we can put k/d/a/hd/td etc here too
      // There are some discrepancies in field names, e.g. starttime instead of start_time and item_7 instead of backpack_0
      // We'll also want to remove the extra data from being stored in gcdata column to save space
    }),
  );
  const matchToInsert: GcMatch = {
    match_id: matchId,
    players,
    series_id: data.match.series_id,
    series_type: data.match.series_type,
    // With match_id, cluster, and replay salt we can construct a replay URL
    cluster: data.match.cluster,
    replay_salt: data.match.replay_salt,
  };
  // Update series id and type for pro match
  await db.raw(
    'UPDATE matches SET series_id = ?, series_type = ?, cluster = ?, replay_salt = ? WHERE match_id = ?',
    [
      matchToInsert.series_id,
      matchToInsert.series_type,
      matchToInsert.cluster,
      matchToInsert.replay_salt,
      matchId,
    ],
  );
  // Put extra fields in matches/player_matches (do last since after this we won't fetch from GC again)
  await insertMatch(matchToInsert, {
    type: 'gcdata',
    pgroup: extraData.pgroup,
    origin: extraData.origin,
    endedAt: data.match.starttime + data.match.duration,
  });
  return null;
}

/**
 * Attempts once to fetch the GC data and read it back
 * @param matchId
 * @param pgroup
 * @returns The GC data, or nothing if we failed
 */
async function tryFetchGcData(
  matchId: number,
  pgroup: PGroup,
): Promise<GcMatch | null> {
  try {
    await saveGcData(matchId, { pgroup });
    return readGcData(matchId, false);
  } catch (e) {
    console.log(e);
    return null;
  }
}

/**
 * Returns GC data, reading the saved version.
 * If not present, fills it and then reads it back.
 * Throws if we can't find it
 * @param job
 * @returns
 */
async function getOrFetchGcData(
  matchId: number,
  extraData: GcExtraData,
): Promise<{
  data: GcMatch | null;
  error: string | null;
}> {
  if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
    throw new Error('invalid match_id');
  }
  // Check if we have gcdata cached
  const saved = await readGcData(matchId, false);
  if (saved) {
    redisCount('regcdata');
    if (config.DISABLE_REGCDATA) {
      // If high load, we can disable refetching gcdata
      return { data: saved, error: null };
    }
  }
  // If we got here we don't have it saved or want to refetch
  const error = await saveGcData(matchId, extraData);
  if (error) {
    return { data: null, error };
  }
  const result = await readGcData(matchId, false);
  return { data: result, error: null };
}

async function getOrFetchGcDataWithRetry(
  matchId: number,
  extraData: GcExtraData,
): Promise<{
  data: GcMatch | null;
  error: string | null;
}> {
  let data: GcMatch | null = null;
  let error: string | null = null;
  let tryCount = 1;
  // Try until we either get data or a non-exception error
  while (!data && !error) {
    try {
      const resp = await getOrFetchGcData(matchId, extraData);
      data = resp.data;
      error = resp.error;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        console.log(matchId, e.response?.config?.url, e.message);
      } else {
        console.error(e);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      tryCount += 1;
      console.log('retrying %s, attempt %s', matchId, tryCount);
    }
  }
  return { data, error };
}

export class GcdataFetcher extends MatchFetcher<GcMatch> {
  readData = readGcData;
  getOrFetchData = getOrFetchGcData;
  getOrFetchDataWithRetry = getOrFetchGcDataWithRetry;
  checkAvailable = async (matchId: number) => {
    throw new Error('not implemented');
  }
}