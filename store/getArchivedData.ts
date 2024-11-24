import config from '../config';
import { redisCount } from '../util/utility';
import { Archive } from './archive';
import db from './db';

const matchArchive = config.ENABLE_MATCH_ARCHIVE ? new Archive('match') : null;
const playerArchive = config.ENABLE_PLAYER_ARCHIVE
  ? new Archive('player')
  : null;

export async function tryReadArchivedPlayerMatches(
  accountId: number,
): Promise<ParsedPlayerMatch[]> {
  if (!playerArchive) {
    return [];
  }
  console.time('archive:' + accountId);
  const blob = await playerArchive.archiveGet(accountId.toString());
  const arr = blob ? JSON.parse(blob.toString()) : [];
  console.timeEnd('archive:' + accountId);
  return arr;
}

/**
 * Return parsed data by reading from the archive.
 * @param matchId
 * @returns
 */
export async function tryReadArchivedMatch(
  matchId: number,
): Promise<ParsedMatch | null> {
  try {
    if (!matchArchive) {
      return null;
    }
    // Check if the parsed data is archived
    // Most matches won't be in the archive so it's more efficient not to always try
    const isArchived = Boolean(
      (
        await db.raw(
          'select match_id from parsed_matches where match_id = ? and is_archived IS TRUE',
          [matchId],
        )
      ).rows[0],
    );
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

export async function checkIsArchived(matchId: number): Promise<boolean> {
  return Boolean(
    (
      await db.raw(
        'select match_id from parsed_matches where match_id = ? and is_archived IS TRUE',
        [matchId],
      )
    ).rows[0],
  );
}