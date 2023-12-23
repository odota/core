import config from '../config';
import { generateJob, getSteamAPIData, redisCount } from '../util/utility';
import cassandra from './cassandra';
import { insertMatch } from './insert';
import type { ApiMatch } from './pgroup';
import redis from './redis';

/**
 * Return API data by reading it without fetching.
 * @param matchId
 * @returns
 */
export async function readApiData(
  matchId: number,
): Promise<ApiMatch | undefined> {
  const result = await cassandra.execute(
    'SELECT api FROM match_blobs WHERE match_id = ?',
    [matchId],
    { prepare: true, fetchSize: 1, autoPage: true },
  );
  const row = result.rows[0];
  const data = row?.api ? (JSON.parse(row.api) as ApiMatch) : undefined;
  if (!data) {
    return;
  }
  return data;
}

/**
 * Requests API data and saves it locally
 * @param matchId
 * @returns Error message string
 */
async function saveApiData(matchId: number): Promise<string | null> {
  let body;
  try {
    // Try the steam API
    body = await getSteamAPIData(
      generateJob('api_details', {
        match_id: matchId,
      }).url,
    );
  } catch(e) {
    console.log(e);
    // Expected exception here if invalid match ID
    return 'Invalid Match ID';
  }
  // match details response
  const match = body.result;
  await insertMatch(match, {
    type: 'api',
  });
  return null;
}

/**
 * Attempts to fetch the API data and read it back
 * @param matchId
 * @returns The API data, or nothing if we failed
 */
export async function tryFetchApiData(
  matchId: number,
): Promise<ApiMatch | undefined> {
  try {
    await saveApiData(matchId);
    return readApiData(matchId);
  } catch (e) {
    console.log(e);
    return;
  }
}

/**
 * Returns API data, reading the saved version.
 * If not present, fills it and then reads it back.
 * Throws if we can't find it
 * @param matchId
 * @returns
 */
export async function getOrFetchApiData(matchId: number): Promise<{data: ApiMatch | undefined, error: string | null}> {
  if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
    throw new Error('invalid match_id');
  }
  // Check if we have apidata cached
  const saved = await readApiData(matchId);
  if (saved) {
    redisCount(redis, 'reapi');
    if (config.DISABLE_REAPI) {
      // If high load, we can disable refetching
      return {data: saved, error: null};
    }
  }
  // If we got here we don't have it saved or want to refetch
  const error = await saveApiData(matchId);
  if (error) {
    // We caught an exception from Steam API due to invalid ID
    return { data: undefined, error };
  }
  const result = await readApiData(matchId);
  if (!result) {
    throw new Error('[APIDATA]: Could not get API data for match ' + matchId);
  }
  return { data: result, error: null };
}
