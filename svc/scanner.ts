// Fetches new matches from the Steam API using the sequential endpoint
import config from '../config';
import redis from '../store/redis';
import { insertMatch } from '../store/insert';
import type { ApiMatch } from '../store/pgroup';
import { generateJob, getApiHosts, getSteamAPIData, redisCount } from '../util/utility';
import db from '../store/db';
const API_KEYS = config.STEAM_API_KEY.split(',');
const PAGE_SIZE = 100;
// This endpoint is limited to something like 1 request every 5 seconds
const SCANNER_WAIT = 5000;

async function scanApi(seqNum: number) {
  const offset = Number(config.SCANNER_OFFSET);
  let nextSeqNum = seqNum - offset;
  while (true) {
    if (offset) {
      const numResult = await getCurrentSeqNum();
      if(nextSeqNum > (numResult - offset)) {
        // Secondary scanner is catching up too much. Wait and try again
        console.log('secondary scanner waiting');
        await new Promise(resolve => setTimeout(resolve, SCANNER_WAIT));
        continue;
      }
    }
    const apiHosts = await getApiHosts();
    const parallelism = Math.min(apiHosts.length, API_KEYS.length);
    const scannerWaitCatchup = SCANNER_WAIT / parallelism;
    const container = generateJob('api_sequence', {
      start_at_match_seq_num: nextSeqNum,
    });
    let data = null;
    try {
      data = await getSteamAPIData({
        url: container.url,
        proxy: apiHosts,
      });
    } catch (err: any) {
      // unretryable steam error
      if (err?.result?.status === 2) {
        nextSeqNum += 1;
        redisCount('skip_seq_num');
        // continue with next seq num
        continue;
      } else {
        throw err;
      }
    }
    const resp =
      data && data.result && data.result.matches ? data.result.matches : [];
    console.log('[API] match_seq_num:%s, matches:%s', nextSeqNum, resp.length);
    console.time('insert');
    await Promise.all(resp.map((match: ApiMatch) => processMatch(match)));
    console.timeEnd('insert');
    // Completed inserting matches on this page so update redis
    if (resp.length) {
      nextSeqNum = resp[resp.length - 1].match_seq_num + 1;
      console.log('next_seq_num: %s', nextSeqNum);
    }
    if (!Number(config.SCANNER_OFFSET)) {
      // Only set match seq num on primary
      await db.raw('INSERT INTO last_seq_num(match_seq_num) VALUES (?)', [nextSeqNum]);
    }
    // If not a full page, delay the next iteration
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        resp.length < PAGE_SIZE ? SCANNER_WAIT : scannerWaitCatchup,
      ),
    );
  }
}

async function processMatch(match: ApiMatch) {
  // Optionally throttle inserts to prevent overload
  if (match.match_id % 100 >= Number(config.SCANNER_PERCENT)) {
    return;
  }
  // check if match was previously processed
  const result = await redis.zscore('scanner_insert', match.match_id);
  // console.log(match.match_id, result);
  // don't insert this match if we already processed it recently
  if (!result) {
    if (Number(config.SCANNER_OFFSET)) {
      // secondary scanner picked up a missing match
      redisCount('secondary_scanner');
    }
    await insertMatch(match, {
      type: 'api',
      origin: 'scanner',
    });
    await redis.zadd('scanner_insert', match.match_id, match.match_id);
    // To avoid dups we should always keep more matches here than SCANNER_OFFSET
    await redis.zremrangebyrank('scanner_insert', '0', '-100000');
  }
}

async function getCurrentSeqNum(): Promise<number> {
  const result = await db.raw('select max(match_seq_num) from last_seq_num;');
  return Number(result.rows[0].max) || 0;
}

async function start() {
    let numResult = await getCurrentSeqNum();
    if (!numResult && config.NODE_ENV === 'development') {
      // Never do this in production to avoid skipping sequence number if we didn't pull .env properly
      const container = generateJob('api_history', {});
      // Just get the approximate current seq num
      const data = await getSteamAPIData(container.url);
      numResult = data.result.matches[0].match_seq_num;
    } 
    await scanApi(numResult);
}
start();
