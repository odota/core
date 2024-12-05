import config from '../config';
import { redisCount } from '../util/utility';
import { Archive } from '../store/archive';
import cassandra from '../store/cassandra';
import { type ApiMatch } from '../util/pgroup';
import { BaseFetcher } from './base';

const blobArchive = config.ENABLE_BLOB_ARCHIVE ? new Archive('blob') : null;
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
    const archive = await blobArchive?.archiveGet(`${matchId}_api`);
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
  const saved = await readApiData(matchId, false);
  if (saved) {
    // We currently can't refetch because the Steam GetMatchDetails API is broken
    return { data: saved, error: null };
  }
  return {
    data: null,
    error: '[APIDATA]: Could not get API data for match ' + matchId,
  };
}

export class ApiFetcher extends BaseFetcher<ApiMatch> {
  readData = readApiData;
  getOrFetchData = getOrFetchApiData;
  checkAvailable = () => {
    throw new Error('not implemented');
  }
}
