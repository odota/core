// Fetches new matches from the Steam API using the sequential endpoint
import utility from '../util/utility.mts';
import config from '../config.js';
import redis from '../store/redis.mts';
import { insertMatchPromise } from '../store/queries.mts';

const { getDataPromise, generateJob } = utility;
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
      //@ts-ignore
      data = await getDataPromise({
        url: container.url,
        delay,
      });
    } catch (err: any) {
      // unretryable steam error
      if (err?.result?.status === 2) {
        nextSeqNum += 1;
        utility.redisCount(redis, 'skip_seq_num');
        // continue with next seq num
        continue;
      } else {
        throw err;
      }
    }
    const resp =
      data && data.result && data.result.matches ? data.result.matches : [];
    console.log('[API] match_seq_num:%s, matches:%s', nextSeqNum, resp.length);
    await Promise.all(resp.map((match: Match) => processMatch(match)));
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

async function processMatch(match: Match) {
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
  await insertMatchPromise(match, {
    type: 'api',
    origin: 'scanner',
  });
  await redis.setex(`scanner_insert:${match.match_id}`, 3600 * 4, 1);
}

if (config.START_SEQ_NUM) {
  const result = await redis.get('match_seq_num');
  const numResult = Number(result);
  await scanApi(numResult);
} else if (config.NODE_ENV !== 'production') {
  // Never do this in production to avoid skipping sequence number if we didn't pull .env properly
  const container = generateJob('api_history', {});
  //@ts-ignore
  const data = await getDataPromise(container.url);
  await scanApi(data.result.matches[0].match_seq_num);
} else {
  throw new Error('failed to initialize sequence number');
}
