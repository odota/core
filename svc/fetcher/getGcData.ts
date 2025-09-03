import type { AxiosResponse } from 'axios';
import moment from 'moment';
import config from '../../config.ts';
import db from '../store/db.ts';
import redis from '../store/redis.ts';
import { getRandomRetrieverUrl, redisCount } from '../util/utility.ts';
import axios from 'axios';
import retrieverMatch from '../../test/data/retriever_match.json' with { type: 'json' };
import { insertMatch } from '../util/insert.ts';
import { blobArchive } from '../store/archive.ts';
import { MatchFetcher } from './base.ts';

/**
 * Return GC data by reading it without fetching.
 * @param matchId
 * @returns
 */
async function readGcData(matchId: number): Promise<GcMatch | null> {
  let data = null;
  const archive = await blobArchive.archiveGet(`${matchId}_gcdata`);
  if (archive) {
    redisCount('blob_archive_read');
  }
  data = archive ? (JSON.parse(archive.toString()) as GcMatch) : null;
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
): Promise<{
  data: GcMatch | null;
  error: string | null;
  retryable?: boolean;
}> {
  const url = await getRandomRetrieverUrl(`/match/${matchId}`);
  let resp: AxiosResponse<typeof retrieverMatch>;
  try {
    resp = await axios.get<typeof retrieverMatch>(url, {
      timeout: 3500,
    });
  } catch (e) {
    // Non-200 status (e.g. 429 too many requests or 500 server error)
    let message = '';
    if (axios.isAxiosError(e)) {
      message = e.message;
    }
    console.log(url, message);
    return { data: null, error: 'axiosError: ' + message, retryable: true };
  }
  console.log(url, resp.status);
  const { data, headers } = resp;
  const steamid = headers['x-match-request-steamid'];
  const ip = headers['x-match-request-ip'];
  // Record the total steamids and ip counts (sent back with 200 response even if request timed out)
  redis.hincrby('retrieverSteamIDs', steamid, 1);
  redis.expireat(
    'retrieverSteamIDs',
    moment.utc().startOf('day').add(1, 'day').format('X'),
  );
  redis.hincrby('retrieverIPs', ip, 1);
  redis.expireat(
    'retrieverIPs',
    moment.utc().startOf('day').add(1, 'day').format('X'),
  );
  if (headers['x-match-noretry']) {
    // Steam is blocking this match for community prediction, so return error to prevent retry
    return { error: 'x-match-noretry', data: null };
  }
  if (data.match.game_mode === 'DOTA_GAMEMODE_NONE') {
    // Really old matches have a 0 replay salt so if we don't have gamemode stop retrying
    return {
      error: 'extremely old GC response format without replay salt',
      data: null,
    };
  }
  if (!data || !data.match || !data.match.players || !data.match.replay_salt) {
    // Response doesn't have expected data, try again
    return { error: 'invalid data', data: null, retryable: true };
  }
  // Count successful calls
  redisCount('retriever');
  redis.hincrby('retrieverSuccessSteamIDs', steamid, 1);
  redis.expireat(
    'retrieverSuccessSteamIDs',
    moment.utc().startOf('day').add(1, 'day').format('X'),
  );
  redis.hincrby('retrieverSuccessIPs', ip, 1);
  redis.expireat(
    'retrieverSuccessIPs',
    moment.utc().startOf('day').add(1, 'day').format('X'),
  );
  const players = data.match.players.map(
    (p: any, i: number): GcPlayer => ({
      // NOTE: account ids are not anonymous in this call
      account_id: p.account_id,
      player_slot: p.player_slot,
      party_id: Number(p.party_id),
      permanent_buffs: p.permanent_buffs ?? [],
      party_size: data.match.players.filter(
        (matchPlayer: any) =>
          Number(matchPlayer.party_id) === Number(p.party_id),
      ).length,
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
  return { data: matchToInsert, error: null };
}

/**
 * Returns GC data, reading the saved version.
 * If not present, fills it and then reads it back.
 * On error, returns object with error prop
 * @param job
 * @returns
 */
async function getOrFetchGcData(
  matchId: number,
  extraData: GcExtraData,
): Promise<{
  data: GcMatch | null;
  error: string | null;
  skipped?: boolean;
  retryable?: boolean;
}> {
  if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
    return { data: null, error: 'invalid match id', skipped: true };
  }
  // Check if we have gcdata cached
  const saved = await readGcData(matchId);
  if (saved) {
    redisCount('regcdata');
    if (config.DISABLE_REGCDATA) {
      // If high load, we can disable refetching gcdata
      return { data: saved, error: null, skipped: true };
    }
  }
  // If we got here we don't have it saved or want to refetch
  const { data, error, retryable } = await saveGcData(matchId, extraData);
  if (error) {
    return { data: null, error, retryable };
  }
  return { data, error: null };
}

async function getOrFetchGcDataWithRetry(
  matchId: number,
  extraData: GcExtraData,
  retryDelay: number,
): Promise<{
  data: GcMatch | null;
  error: string | null;
}> {
  let data: GcMatch | null = null;
  let error: string | null = null;
  let tryCount = 1;
  // Try until we either get data or non-retryable error
  while (!data) {
    const resp = await getOrFetchGcData(matchId, extraData);
    data = resp.data;
    error = resp.error;
    if (error && !resp.retryable) {
      break;
    }
    if (!data) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      tryCount += 1;
      console.log('matchId %s, error %s, attempt %s', matchId, error, tryCount);
    }
  }
  return { data, error };
}

class GcdataFetcher extends MatchFetcher<GcMatch> {
  readData = readGcData;
  getOrFetchData = getOrFetchGcData;
  getOrFetchDataWithRetry = getOrFetchGcDataWithRetry;
  checkAvailable = async (matchId: number) => {
    throw new Error('not implemented');
  };
}

export const gcFetcher = new GcdataFetcher();
