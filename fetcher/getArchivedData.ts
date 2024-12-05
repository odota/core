import config from '../config';
import { redisCount } from '../util/utility';
import { Archive } from '../store/archive';
import db from '../store/db';
import { BaseFetcher } from './base';

const matchArchive = config.ENABLE_MATCH_ARCHIVE ? new Archive('match') : null;

/**
 * Return parsed data by reading from the archive.
 * @param matchId
 * @returns
 */
async function readArchivedMatch(
  matchId: number,
): Promise<ParsedMatch | null> {
  try {
    if (!matchArchive) {
      return null;
    }
    // Check if the parsed data is archived
    // Most matches won't be in the archive so it's more efficient not to always try
    const isArchived = await checkIsArchived(matchId);
    if (!isArchived) {
      return null;
    }
    const blob = await matchArchive.archiveGet(matchId.toString());
    const result: ParsedMatch | null = blob
      ? JSON.parse(blob.toString())
      : null;
    if (result) {
      redisCount('match_archive_read');
      return result;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

async function checkIsArchived(matchId: number): Promise<boolean> {
  return Boolean(
    (
      await db.raw(
        'select match_id from parsed_matches where match_id = ? and is_archived IS TRUE',
        [matchId],
      )
    ).rows[0],
  );
}

export class ArchivedFetcher extends BaseFetcher<ParsedMatch> {
  readData = readArchivedMatch;
  getOrFetchData = async (matchId: number) => ({ data: await readArchivedMatch(matchId), error: null });
  checkAvailable = checkIsArchived;
}