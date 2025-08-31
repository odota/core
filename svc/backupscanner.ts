// Alternative to scanner if seq match data endpoint isn't available
// Works by repeatedly checking match histories for players
/*
import redis from '../store/redis.ts';
import { insertMatch } from '../store/insert.ts';
import config from '../config.ts';
import {
  generateJob,
  getSteamAPIData,
  invokeIntervalAsync,
} from '../util/utility.ts';
const parallelism = 1;
const delay = 1000;

async function processMatch(matchId: number) {
  // Check if exists
  const res = await redis.get(`scanner_insert:${matchId}`);
  if (!res) {
    const url = SteamAPIUrls.api_details({
      match_id: matchId,
    });
    const body = await getSteamAPIData({
      url,
      delay,
    });
    if (!body.result) {
      return;
    }
    const match = body.result;
    await insertMatch(match, {
      type: 'api',
      origin: 'scanner',
    });
    // Set with long expiration (1 month) to avoid picking up the same matches again
    // If GetMatchHistoryBySequenceNum is out for a long time, this might be a problem
    redis.setex(`scanner_insert:${match.match_id}`, 3600 * 24 * 30, 1);
  }
}
async function processPlayer(accountId: string) {
  const url = SteamAPIUrls.api_history({
    account_id: accountId,
  });
  const body = await getSteamAPIData({
    url,
    delay,
  });
  if (!body || !body.result || !body.result.matches) {
    // Skip this player on this iteration
    return;
  }
  // Get matches with recent seqnums
  const matches = body.result.matches
    .filter((m: any) => m.match_seq_num > Number(res))
    .map((m: any) => m.match_id);
  for (let i = 0; i < matches.length; i++) {
    await processMatch(matches[i]);
  }
}
async function doBackupScanner() {
  const ids = await redis.zrange('tracked', 0, -1);
  processPlayer(id[0]);
}
invokeIntervalAsync(doBackupScanner, 1000);
*/
