import moment from 'moment';
import config from '../config';
import db from './db';
import redis from './redis';
import cassandra from './cassandra';
import {
  getRandomRetrieverUrl,
  getRegistryUrl,
  redisCount,
} from '../util/utility';
import axios from 'axios';
import retrieverMatch from '../test/data/retriever_match.json';
import { insertMatch } from './insert';

type GcExtraData = {
  origin?: DataOrigin;
  pgroup: PGroup;
};

/**
 * Return GC data by reading it without fetching.
 * @param matchId
 * @returns
 */
export async function readGcData(matchId: number): Promise<GcMatch | null> {
  const result = await cassandra.execute(
    'SELECT gcdata FROM match_blobs WHERE match_id = ?',
    [matchId],
    { prepare: true, fetchSize: 1, autoPage: true },
  );
  const row = result.rows[0];
  const gcData = row?.gcdata ? (JSON.parse(row.gcdata) as GcMatch) : undefined;
  if (!gcData) {
    return null;
  }
  const { match_id, cluster, replay_salt } = gcData;
  if (match_id == null || cluster == null || replay_salt == null) {
    return null;
  }
  return gcData;
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
  const url = config.USE_SERVICE_REGISTRY
    ? await getRegistryUrl('retriever', `/match/${matchId}`)
    : getRandomRetrieverUrl(`/match/${matchId}`);
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
  if (!data || !data.match || !data.match.replay_salt || !data.match.players) {
    // Bad data but we can retry
    throw new Error('invalid data');
  }
  // Count successful calls
  redisCount(redis, 'retriever');
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
      // NOTE: account ids are not anonymous in this call so we don't include it in the data to insert
      // We could start storing this data but then the API also needs to respect the user's match history setting
      // account_id: p.account_id,
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
export async function tryFetchGcData(
  matchId: number,
  pgroup: PGroup,
): Promise<GcMatch | null> {
  try {
    await saveGcData(matchId, { pgroup });
    return readGcData(matchId);
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
export async function getOrFetchGcData(
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
  const saved = await readGcData(matchId);
  if (saved) {
    redisCount(redis, 'regcdata');
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
  const result = await readGcData(matchId);
  return { data: result, error: null };
}

export async function getOrFetchGcDataWithRetry(
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
      await new Promise((resolve) => setTimeout(resolve, 1000));
      tryCount += 1;
      console.log('retrying %s, attempt %s', matchId, tryCount);
    }
  }
  return { data, error };
}
