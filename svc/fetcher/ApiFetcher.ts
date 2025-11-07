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
import { GcdataFetcher } from './GcdataFetcher.ts';

const gcFetcher = new GcdataFetcher();

export class ApiFetcher extends MatchFetcher<ApiData> {
  useSavedData = Boolean(config.DISABLE_REAPI);
  getData = async (matchId: number): Promise<ApiData | null> => {
    let data = null;
    const archive = await blobArchive.archiveGet(`${matchId}_api`);
    data = archive ? (JSON.parse(archive.toString()) as ApiData) : null;
    return data;
  };
  fetchData = async (
    matchId: number,
    options: { seqNumBackfill?: boolean },
  ) => {
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
    while (!data && pageBack <= 1000) {
      pageBack += 1;
      console.log('paging back %s for matchId %s', pageBack, matchId);
      data = await this.getData(matchId - pageBack);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      redisCount('backfill_page_back');
    }
    if (!data) {
      redisCount('backfill_fail');
      console.log('could not find approx seqnum for match %s', matchId);
      return;
    }
    // Note, match_id and match_seq_num aren't in the same order, so there's no guarantee that we'll find the match in the page
    async function getPageFindMatch(earlierSeqNum: number, matchId: number): Promise<[ApiData, number, number]> {
      const url = SteamAPIUrls.api_sequence({
        start_at_match_seq_num: earlierSeqNum,
        matches_requested: 100,
      });
      const body = await getSteamAPIDataWithRetry({
        url,
      });
      const match = body.result.matches.find(
        (m: ApiData) => m.match_id === matchId,
      );
      const first = body.result.matches[0];
      const last = body.result.matches[body.result.matches.length - 1];
      await new Promise(resolve => setTimeout(resolve, 3000));
      return [match, first.start_time + first.duration, last.start_time + last.duration];
    }
    let earlierSeqNum = data.match_seq_num;
    const approxSeqNum = earlierSeqNum;
    let [match, firstEndedAt, lastEndedAt] = await getPageFindMatch(earlierSeqNum, matchId);
    let targetEndedAt;
    if (!match) {
      // Make a call to retriever and check the endedAt of the target match to help locate
      // Fetcher may require retries, if retryable error
      while (!targetEndedAt) {
        const { retryable, endedAt } = await gcFetcher.fetchData(matchId, null);
        targetEndedAt = endedAt;
        if (!retryable) {
          break;
        }
      }
    }
    if (!targetEndedAt) {
      console.log('could not find %s targetEndedAt from retriever', matchId);
      return;
    }
    let backward = true;
    while (!match) {
      // Compare to the times from body.result.matches
      console.log('firstEndedAt: %s, lastEndedAt: %s, targetEndedAt: %s', new Date(firstEndedAt * 1000).toISOString(), new Date(lastEndedAt * 1000).toISOString(), new Date(targetEndedAt * 1000).toISOString());
      if (Math.abs(earlierSeqNum - approxSeqNum) > 7500 && !match) {
        // Too far out of range
        // Try switching directions if we haven't
        // if (backward) {
        //   backward = false;
        //   earlierSeqNum = approxSeqNum;
        //   continue;
        // }
        redisCount('backfill_fail');
        console.log('could not find in seqnum response match %s', matchId);
        return;
      }
      if (backward) {
        console.log('go back');
        earlierSeqNum -= 100;
      } else {
        console.log('go forward');
        earlierSeqNum += 100;
      }
      let result = await getPageFindMatch(earlierSeqNum, matchId);
      match = result[0];
      firstEndedAt = result[1];
      lastEndedAt = result[2];
    }
    redisCount('backfill_success');
    console.log(match);
    return match;
  };
  checkAvailable = () => {
    throw new Error('not implemented');
  };
}
