import { isDataComplete, redisCount } from '../util/utility';
import { Archive } from '../store/archive';
import db from '../store/db';
import { MatchFetcher } from './base';
import { getMatchDataFromBlobWithMetadata } from '../util/buildMatch';

const matchArchive = new Archive('match');

/**
 * Consolidates separate match data blobs and stores as a single blob in archive
 * @param matchId
 * @returns
 */
async function doArchiveMatchFromBlobs(matchId: number) {
  // Don't read from archive when determining whether to archive
  const [match, metadata] = await getMatchDataFromBlobWithMetadata(matchId, {
    noArchive: true,
    // TODO Remove noBlobStore once migrated
    noBlobStore: true,
  });
  if (match && metadata?.has_parsed) {
    // check data completeness with isDataComplete
    if (!isDataComplete(match as ParsedMatch)) {
      redisCount('incomplete_archive');
      console.log('INCOMPLETE skipping match %s', matchId);
      return;
    }
    // Archive the data since it's parsed. This might also contain api and gcdata
    const blob = Buffer.from(JSON.stringify(match));
    const result = await matchArchive.archivePut(matchId.toString(), blob);
    if (result) {
      // Mark the match archived
      await db.raw(
        `UPDATE parsed_matches SET is_archived = TRUE WHERE match_id = ?`,
        [matchId],
      );
      // TODO delete blobs
      // await deleteMatch(matchId);
      console.log('ARCHIVE match %s, parsed', matchId);
    }
    return result;
  }
}

export class ArchivedFetcher extends MatchFetcher<ParsedMatch> {
  readData = async (
    matchId: number,
  ): Promise<ParsedMatch | null> => {
    try {
      // Check if the parsed data is archived
      // Most matches won't be in the archive so it's more efficient not to always try
      const isArchived = await this.checkAvailable(matchId);
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
  };
  getOrFetchData = async (matchId: number) => {
    await doArchiveMatchFromBlobs(matchId);
    return { data: await this.readData(matchId), error: null };
  };
  checkAvailable = async (matchId: number) => {
    return Boolean(
      (
        await db.raw(
          'select match_id from parsed_matches where match_id = ? and is_archived IS TRUE',
          [matchId],
        )
      ).rows[0],
    );
  };
}