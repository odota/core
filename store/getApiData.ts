import config from '../config';
import { generateJob, getSteamAPIData, redisCount } from '../util/utility';
import cassandra from './cassandra';
import { insertMatch } from './insert';
import { getPGroup, type ApiMatch } from './pgroup';
import redis from './redis';

/**
 * Return API data by reading it without fetching.
 * @param matchId
 * @returns
 */
export async function readApiData(matchId: number): Promise<ApiMatch | null> {
  const result = await cassandra.execute(
    'SELECT api FROM match_blobs WHERE match_id = ?',
    [matchId],
    { prepare: true, fetchSize: 1, autoPage: true },
  );
  const row = result.rows[0];
  const data = row?.api ? (JSON.parse(row.api) as ApiMatch) : undefined;
  if (!data) {
    return null;
  }
  return data;
}

/**
 * Requests API data and saves it locally
 * @param matchId
 * @returns Error message string
 */
export async function saveApiData(
  matchId: number,
  noRetry?: boolean,
): Promise<{ error: string | null; pgroup: PGroup | null }> {
  let body;
  try {
    // Try the steam API
    body = await getSteamAPIData({
      url: generateJob('api_details', {
        match_id: matchId,
      }).url,
      proxy: true,
      noRetry,
    });
  } catch (e: any) {
    console.log(e);
    if (e?.result?.error === 'Match ID not found') {
      // Steam API reported this ID doesn't exist
      redisCount(redis, 'steam_api_notfound');
    }
    // Expected exception here if invalid match ID
    return { error: 'Failed to get data from Steam API', pgroup: null };
  }
  // match details response
  const match = body.result;
  const { pgroup } = await insertMatch(match, {
    type: 'api',
    // Don't overwrite the blob since it might have less data
    // But we still want to compute a new pgroup and update player_caches
    ifNotExists: true,
  });
  return { error: null, pgroup };
}

/**
 * Attempts to fetch the API data and read it back
 * @param matchId
 * @returns The API data, or nothing if we failed
 */
export async function tryFetchApiData(
  matchId: number,
  noRetry?: boolean,
): Promise<ApiMatch | null> {
  try {
    await saveApiData(matchId, noRetry);
    return readApiData(matchId);
  } catch (e: any) {
    console.log(e);
    return null;
  }
}

/**
 * Returns API data, reading the saved version.
 * If not present, fills it and then reads it back.
 * Throws if we can't find it
 * @param matchId
 * @returns
 */
export async function getOrFetchApiData(matchId: number, noRetry = false): Promise<{
  data: ApiMatch | null;
  error: string | null;
  pgroup: PGroup | null;
}> {
  if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
    throw new Error('invalid match_id');
  }
  // Check if we have apidata cached
  const saved = await readApiData(matchId);
  if (saved) {
    redisCount(redis, 'reapi');
    if (config.DISABLE_REAPI) {
      // If high load, we can disable refetching
      // But this will also mean we can't update player_caches for previously anonymous players
      // since we use the original pgroup
      return { data: saved, error: null, pgroup: getPGroup(saved) };
    }
  }
  // If we got here we don't have it saved or want to refetch
  const { error, pgroup } = await saveApiData(matchId, noRetry);
  if (error) {
    // We caught an exception from Steam API due to invalid ID
    return { data: null, error, pgroup };
  }
  const result = await readApiData(matchId);
  if (!result) {
    throw new Error('[APIDATA]: Could not get API data for match ' + matchId);
  }
  return { data: result, error: null, pgroup };
}
