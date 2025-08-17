// Fetches old matches from Steam API and writes to blob storage
import config from '../config';
import { blobArchive } from './store/archive';
import type { ApiMatch } from './util/types';
import {
  SteamAPIUrls,
  getSteamAPIData,
  transformMatch,
  getApiHosts,
} from './util/utility';
import fs from 'fs';
import redis from './store/redis';

// following need to be set
// STEAM_API_KEY
// ARCHIVE_S3_KEY_ID: 'minioadmin',
// ARCHIVE_S3_KEY_SECRET: 'minioadmin',
// ARCHIVE_S3_ENDPOINT: 'http://localhost:9000',

// current run started at 5000000000
const stop = Number(process.env.BACKFILL_STOP) || 6200000000;
async function scanApi() {
  while (true) {
    // This endpoint is limited to something like 1 request every 5 seconds
    const apiHosts = await getApiHosts();
    const SCANNER_WAIT = 2000 / apiHosts.length;
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
      process.exit(0);
    }
    const begin = Date.now();
    const url = SteamAPIUrls.api_sequence({
      start_at_match_seq_num: seqNum,
    });
    let data = null;
    try {
      data = await getSteamAPIData({
        url,
        // We could rotate through proxies here to ensure consistent load
        proxy: apiHosts,
      });
    } catch (err: any) {
      console.log(err);
      await new Promise((resolve) => setTimeout(resolve, SCANNER_WAIT));
      continue;
    }
    const resp =
      data && data.result && data.result.matches ? data.result.matches : [];
    console.log('[API] match_seq_num:%s, matches:%s', seqNum, resp.length);
    // write to blobstore, process the blob using same function as insertMatch
    try {
      const insertResult = await Promise.all(
        resp.map(async (origMatch: ApiMatch) => {
          const match = transformMatch(origMatch);
          const result = await blobArchive.archivePut(
            match.match_id + '_api',
            Buffer.from(JSON.stringify(match)),
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
    const end = Date.now();
    const elapsed = end - begin;
    const adjustedWait = Math.max(SCANNER_WAIT - elapsed, 0);
    console.log('iteration: %dms', elapsed);
    await new Promise((resolve) => setTimeout(resolve, adjustedWait));
  }
}

async function start() {
  await scanApi();
}
start();
