import {
  SteamAPIUrls,
  getSteamAPIDataWithRetry,
  redisCount,
} from '../util/utility.ts';
import { blobArchive } from '../store/archive.ts';
import { MatchFetcher } from './base.ts';
import { insertMatch } from '../util/insert.ts';
import { config } from '../../config.ts';
import db from '../store/db.ts';

export class ApiFetcher extends MatchFetcher<ApiMatch> {
  useSavedData = Boolean(config.DISABLE_REAPI);
  getData = async (matchId: number): Promise<ApiMatch | null> => {
    let data = null;
    const archive = await blobArchive.archiveGet(`${matchId}_api`);
    if (archive) {
      redisCount('blob_archive_read');
    }
    data = archive ? (JSON.parse(archive.toString()) as ApiMatch) : null;
    return data;
  };
  fetchData = async (matchId: number, options?: { seqNumBackfill?: boolean }) => {
    let match;
    try {
      // We currently can't fetch because the Steam GetMatchDetails API is broken
      // const url = SteamAPIUrls.api_details({
      //   match_id: matchId,
      // });
      // const body = await getSteamAPIData({
      //   url,
      // });
      // match = body.result;
      if (options?.seqNumBackfill) {
        match = await this.backfillFromSeqNumApi_INTERNAL(matchId);
      }
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
      // insertMatch transforms the data before saving
      // So we need to read it back instead of returning match here
      const result = await this.getData(matchId);
      if (result) {
        return { data: result, error: null };
      }
    }
    return {
      data: null,
      error: '[APIDATA]: Could not get API data for match ' + matchId,
    };
  };
  backfillFromSeqNumApi_INTERNAL = async (matchId: number) => {
    // Try to get match data from blob store
    // If not available, go back 1 ID number and try again until success (or 0)
    // count how many times we do this (max 100)
    // on success, call GetMatchHistoryBySequenceNum with the seq num of the preceding match and matches_requested of the number of times we went back
    // Get just the one match in the array matching the target number
    // Insert the data normally as if API data from scanner
    
    // Don't try with recent matches since there might be gaps in match IDs
    const max = (await db.raw('select max(match_id) from public_matches'))
      ?.rows?.[0]?.max;
    const limit = max - 10000;
    if (matchId > limit) {
      redisCount('backfill_skip');
      return null;
    }
    let data = await this.getData(matchId);
    let pageBack = 0;
    while (!data && pageBack <= 100) {
      pageBack += 1;
      console.log('paging back %s for matchId %s', pageBack, matchId);
      data = await this.getData(matchId - pageBack);
      await new Promise((resolve) => setTimeout(resolve, 500));
      redisCount('backfill_page_back');
    }
    if (!data) {
      redisCount('backfill_fail');
      throw new Error('could not find preceding seqnum for match ' + matchId);
    }
    const precedingSeqNum = data.match_seq_num;
    const url = SteamAPIUrls.api_sequence({
      start_at_match_seq_num: precedingSeqNum,
      matches_requested: pageBack,
    });
    const body = await getSteamAPIDataWithRetry({
      url,
    });
    const match = body.result.matches.find(
      (m: ApiMatch) => m.match_id === matchId,
    );
    if (!match) {
      redisCount('backfill_fail');
      throw new Error('could not find in seqnum response match ' + matchId);
    }
    redisCount('backfill_success');
    console.log(match);
    return match;
  };
  checkAvailable = () => {
    throw new Error('not implemented');
  };
}
