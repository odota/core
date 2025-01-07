import { SteamAPIUrls, getSteamAPIData, redisCount } from '../util/utility';
import { blobArchive } from '../store/archive';
import cassandra from '../store/cassandra';
import type { ApiMatch } from '../util/types';
import { MatchFetcher } from './base';
import { insertMatch } from '../util/insert';

/**
 * Return API data by reading it without fetching.
 * @param matchId
 * @returns
 */
async function readApiData(
  matchId: number,
  noBlobStore: boolean | undefined,
): Promise<ApiMatch | null> {
  let data = null;
  if (!noBlobStore) {
    const archive = await blobArchive.archiveGet(`${matchId}_api`);
    if (archive) {
      redisCount('blob_archive_read');
    }
    data = archive ? (JSON.parse(archive.toString()) as ApiMatch) : null;
  }
  if (!data) {
    const result = await cassandra.execute(
      'SELECT api FROM match_blobs WHERE match_id = ?',
      [matchId],
      { prepare: true, fetchSize: 1, autoPage: true },
    );
    const row = result.rows[0];
    data = row?.api ? (JSON.parse(row.api) as ApiMatch) : null;
    if (data) {
      redisCount('api_cassandra_read');
    }
  }
  return data;
}

/**
 * Returns API data, reading the saved version.
 * Fetching currently disabled due to Steam API outage
 * @param matchId
 * @returns
 */
async function getOrFetchApiData(matchId: number): Promise<{
  data: ApiMatch | null;
  error: string | null;
}> {
  if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
    return { data: null, error: '[APIDATA]: invalid match_id' };
  }
  // Check if we have apidata cached
  let saved = await readApiData(matchId, false);
  if (saved) {
    return { data: saved, error: null };
  }
  const url = SteamAPIUrls.api_details({
    match_id: matchId,
  });
  let match;
  try {
    // We currently can't fetch because the Steam GetMatchDetails API is broken
    // const body = await getSteamAPIData({
    //   url,
    // });
    // match = body.result;
  } catch (e: any) {
    if (e?.result?.error === 'Match ID not found') {
      // Steam API reported this ID doesn't exist
      redisCount('steam_api_notfound');
    } else {
      console.log(e);
    }
  }
  if (match) {
    await insertMatch(match, {
      type: 'api',
    });
    saved = await readApiData(matchId, false);
    if (saved) {
      return { data: saved, error: null };
    }
  }
  return {
    data: null,
    error: '[APIDATA]: Could not get API data for match ' + matchId,
  };
}

class ApiFetcher extends MatchFetcher<ApiMatch> {
  readData = readApiData;
  getOrFetchData = getOrFetchApiData;
  checkAvailable = () => {
    throw new Error('not implemented');
  };
}

export const apiFetcher = new ApiFetcher();

