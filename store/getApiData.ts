import config from '../config';
import { redisCount } from '../util/utility';
import { Archive } from './archive';
import cassandra from './cassandra';
import { getPGroup, type ApiMatch } from './pgroup';

const blobArchive = config.ENABLE_BLOB_ARCHIVE ? new Archive('blob') : null;
/**
 * Return API data by reading it without fetching.
 * @param matchId
 * @returns
 */
export async function readApiData(
  matchId: number,
  noBlobStore?: boolean,
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
export async function getOrFetchApiData(
  matchId: number,
): Promise<{
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
    // We currently can't refetch because the Steam GetMatchDetails API is broken
    return { data: saved, error: null, pgroup: getPGroup(saved) };
  }
  return {
    data: null,
    error: '[APIDATA]: Could not get API data for match ' + matchId,
    pgroup: null,
  };
}
