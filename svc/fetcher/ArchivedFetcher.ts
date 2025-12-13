import { matchArchive } from "../store/archive.ts";
import db from "../store/db.ts";
import { MatchFetcherBase } from "./MatchFetcherBase.ts";
import { doArchiveMatchFromBlobs } from "../util/archiveUtil.ts";
import { redisCount } from "../store/redis.ts";

export class ArchivedFetcher extends MatchFetcherBase<ParsedMatch> {
  getData = async (matchId: number): Promise<ParsedMatch | null> => {
    // Check if the parsed data is archived
    // Most matches won't be in the archive so it's more efficient not to always try
    const isAvailable = await this.checkAvailable(matchId);
    if (!isAvailable) {
      return null;
    }
    const blob = await matchArchive.archiveGet(matchId.toString());
    const result: ParsedMatch | null = blob
      ? JSON.parse(blob.toString())
      : null;
    if (result) {
      redisCount("match_archive_read");
      return result;
    }
    return null;
  };
  fetchData = async (matchId: number) => {
    await doArchiveMatchFromBlobs(matchId);
    return { data: null, error: null };
  };
  checkAvailable = async (matchId: number) => {
    return Boolean(
      (
        await db.raw(
          "select match_id from parsed_matches where match_id = ? and is_archived IS TRUE",
          [matchId],
        )
      ).rows[0],
    );
  };
}
