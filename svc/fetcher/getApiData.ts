import { SteamAPIUrls, getSteamAPIData, redisCount } from '../util/utility.ts';
import { blobArchive } from '../store/archive.ts';
import type { ApiMatch } from '../util/types.ts';
import { MatchFetcher } from './base.ts';
import { insertMatch } from '../util/insert.ts';

class ApiFetcher extends MatchFetcher<ApiMatch> {
  getData = async (matchId: number): Promise<ApiMatch | null> => {
    let data = null;
    const archive = await blobArchive.archiveGet(`${matchId}_api`);
    if (archive) {
      redisCount('blob_archive_read');
    }
    data = archive ? (JSON.parse(archive.toString()) as ApiMatch) : null;
    return data;
  }
  getOrFetchData = async (matchId: number): Promise<{
    data: ApiMatch | null;
    error: string | null;
  }> => {
    if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
      return { data: null, error: '[APIDATA]: invalid match_id' };
    }
    // Check if we have apidata cached
    let saved = await this.getData(matchId);
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
      // insertMatch transforms the data before saving
      // So we need to read it back instead of returning match here
      saved = await this.getData(matchId);
      if (saved) {
        return { data: saved, error: null };
      }
    }
    return {
      data: null,
      error: '[APIDATA]: Could not get API data for match ' + matchId,
    };
  };
  fetchDataFromSeqNumApi = async (matchId: number) => {
    // Try to get match data from blob store
    // If not available, go back 1 ID number and try again until success (or 0)
    // count how many times we do this (max 100)
    // on success, call GetMatchHistoryBySequenceNum with the seq num of the preceding match and matches_requested of the number of times we went back
    // Get just the one match in the array matching the target number
    // Insert the data normally as if API data from scanner
    let data = await this.getData(matchId);
    let pageBack = 0;
    while (!data && pageBack < 100) {
      pageBack += 1;
      data = await this.getData(matchId - pageBack);
    }
    if (!data) {
      return;
    }
    const precedingSeqNum = data.match_seq_num;
    const url = SteamAPIUrls.api_sequence({
      start_at_match_seq_num: precedingSeqNum,
      matches_requested: pageBack,
    });
    const body = await getSteamAPIData({
      url,
    });
    const match = body.result.matches.find((m: ApiMatch) => m.match_id === matchId);
    if (!match) {
      return;
    }
    console.log(match);
    // await insertMatch(match, {
    //   type: 'api',
    // });
  };
  checkAvailable = () => {
    throw new Error('not implemented');
  };
}

export const apiFetcher = new ApiFetcher();
