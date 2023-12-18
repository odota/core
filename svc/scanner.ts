// Fetches new matches from the Steam API using the sequential endpoint
import config from '../config.js';
import redis from '../store/redis';
import { ApiMatch, insertMatch } from '../store/queries';
import { generateJob, getSteamAPIData, redisCount } from '../util/utility';

const delay = Number(config.SCANNER_DELAY);
const PAGE_SIZE = 100;

async function scanApi(seqNum: number) {
  let nextSeqNum = seqNum;
  let delayNextRequest = false;
  while (true) {
    const container = generateJob('api_sequence', {
      start_at_match_seq_num: nextSeqNum,
    });
    let data = null;
    try {
      data = await getSteamAPIData({
        url: container.url,
        delay,
      });
    } catch (err: any) {
      // unretryable steam error
      if (err?.result?.status === 2) {
        nextSeqNum += 1;
        redisCount(redis, 'skip_seq_num');
        // continue with next seq num
        continue;
      } else {
        throw err;
      }
    }
    const resp =
      data && data.result && data.result.matches ? data.result.matches : [];
    console.log('[API] match_seq_num:%s, matches:%s', nextSeqNum, resp.length);
    await Promise.all(resp.map((match: ApiMatch) => processMatch(match)));
    // Completed inserting matches on this page so update redis
    if (resp.length) {
      nextSeqNum = resp[resp.length - 1].match_seq_num + 1;
      console.log('next_seq_num: %s', nextSeqNum);
    }
    if (resp.length < PAGE_SIZE) {
      delayNextRequest = true;
    }
    await redis.set('match_seq_num', nextSeqNum);
    // If not a full page, delay the next iteration
    await new Promise((resolve) =>
      setTimeout(resolve, delayNextRequest ? 3000 : 0)
    );
  }
}

async function processMatch(match: ApiMatch) {
  // Optionally throttle inserts to prevent overload
  if (match.match_id % 100 >= Number(config.SCANNER_PERCENT)) {
    return;
  }
  // check if match was previously processed
  const result = await redis.get(`scanner_insert:${match.match_id}`);
  // don't insert this match if we already processed it recently
  if (result) {
    return;
  }
  await insertMatch(match, {
    type: 'api',
    origin: 'scanner',
  });
  await redis.setex(`scanner_insert:${match.match_id}`, 3600 * 4, 1);
}

async function start() {
  if (config.START_SEQ_NUM) {
    const result = await redis.get('match_seq_num');
    const numResult = Number(result);
    await scanApi(numResult);
  } else if (config.NODE_ENV !== 'production') {
    // Never do this in production to avoid skipping sequence number if we didn't pull .env properly
    const container = generateJob('api_history', {});
    // Just get the approximate current seq num
    const data = await getSteamAPIData(container.url);
    await scanApi(data.result.matches[0].match_seq_num);
  } else {
    throw new Error('failed to initialize sequence number');
  }
}
start();

// This is the only process that isn't a webserver, runQueue(), or invokeIntervalAsync()
// so it needs its own exception handler
process.on('unhandledRejection', (reason, p) => {
  // In production pm2 doesn't appear to auto restart unless we exit the process here
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  redisCount(redis, 'scanner_exception');
  process.exit(1);
});
