// Fetches old matches from Steam API and writes to blob storage
import { blobArchive } from './store/archive.ts';
import {
  SteamAPIUrls,
  getSteamAPIDataWithRetry,
  transformMatch,
  runInLoop,
} from './util/utility.ts';
import fs from 'node:fs';
import redis from './store/redis.ts';

// following need to be set
// STEAM_API_KEY
// ARCHIVE_S3_KEY_ID: 'minioadmin',
// ARCHIVE_S3_KEY_SECRET: 'minioadmin',
// ARCHIVE_S3_ENDPOINT: 'http://localhost:9000',

// current run started at 5000000000
const stop = Number(process.env.BACKFILL_STOP) || 6200000000;

runInLoop(async function backfill() {
  // This endpoint is limited to something like 1 request every 5 seconds
  // get progress from redis if available, if not, fallback to file
  let seqNum;
  if (redis) {
    seqNum =
      Number(await redis.get('backfill:' + process.env.BACKFILL_START)) ||
      Number(process.env.BACKFILL_START);
  } else {
    seqNum = Number(fs.readFileSync('./match_seq_num.txt')) || 0;
  }
  if (seqNum > stop) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.exit(0);
  }
  // const begin = Date.now();
  const url = SteamAPIUrls.api_sequence({
    start_at_match_seq_num: seqNum,
    matches_requested: 100,
  });
  let data = null;
  data = await getSteamAPIDataWithRetry({
    url,
    proxy: true,
  });
  const resp =
    data && data.result && data.result.matches ? data.result.matches : [];
  console.log('[API] match_seq_num:%s, matches:%s', seqNum, resp.length);
  // write to blobstore, process the blob using same function as insertMatch
  try {
    const insertResult = await Promise.all(
      resp.map(async (origMatch: ApiData) => {
        const match = transformMatch(origMatch);
        const result = await blobArchive.archivePut(
          match.match_id + '_api',
          Buffer.from(JSON.stringify(match)),
          true,
        );
        if (!result) {
          throw new Error('failed to insert match ' + match.match_id);
        }
      }),
    );
    if (resp.length) {
      const nextSeqNum = resp[resp.length - 1].match_seq_num + 1;
      console.log('next_seq_num: %s', nextSeqNum);
      // Completed inserting matches on this page so update
      if (redis) {
        await redis.set(
          'backfill:' + process.env.BACKFILL_START,
          nextSeqNum.toString(),
        );
      } else {
        fs.writeFileSync('./match_seq_num.txt', nextSeqNum.toString());
      }
    }
  } catch (e) {
    // If any fail, log the error and try the same number again
    console.error(e);
  }
  // const end = Date.now();
  // const elapsed = end - begin;
  // console.log('iteration: %dms', elapsed);
}, 0);
