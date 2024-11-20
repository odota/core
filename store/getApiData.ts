import config from '../config';
import { generateJob, getSteamAPIData, redisCount } from '../util/utility';
import { Archive } from './archive';
import cassandra from './cassandra';
import { insertMatch } from './insert';
import { getPGroup, type ApiMatch } from './pgroup';
import redis from './redis';

const blobArchive = config.ENABLE_BLOB_ARCHIVE ? new Archive('blob') : null;
/**
 * Return API data by reading it without fetching.
 * @param matchId
 * @returns
 */
export async function readApiData(matchId: number, noBlobStore?: boolean): Promise<ApiMatch | null> {
  const result = await cassandra.execute(
    'SELECT api FROM match_blobs WHERE match_id = ?',
    [matchId],
    { prepare: true, fetchSize: 1, autoPage: true },
  );
  const row = result.rows[0];
  let data = row?.api ? (JSON.parse(row.api) as ApiMatch) : undefined;
  if (!data && blobArchive && !noBlobStore) {
    const archive = await blobArchive.archiveGet(`${matchId}_api`);
    if (archive) {
      redisCount(redis, 'blob_archive_read');
    }
    data = archive ? JSON.parse(archive.toString()) as ApiMatch : undefined;
  }
  if (!data) {
    return null;
  }
  return data;
}

/**
 * Returns API data, reading the saved version.
 * Fetching currently disabled due to Steam API outage
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
    // We currently disable refetching because the Steam GetMatchDetails API is broken
    return { data: saved, error: null, pgroup: getPGroup(saved) };
  }
  return { data: null, error: '[APIDATA]: Could not get API data for match ' + matchId, pgroup: null };
}
