// Fetches old matches from Steam API and writes to blob storage
import config from '../config';
import { Archive } from '../store/archive';
import type { ApiMatch } from '../store/pgroup';
import { generateJob, getSteamAPIData, transformMatch } from '../util/utility';
import fs from 'fs';

// following need to be set
// STEAM_API_KEY needs to be set in .env
// BLOB_ARCHIVE_S3_KEY_ID: 'minioadmin',
// BLOB_ARCHIVE_S3_KEY_SECRET: 'minioadmin',
// BLOB_ARCHIVE_S3_ENDPOINT: 'http://localhost:9000',
// BLOB_ARCHIVE_S3_BUCKET: 'opendota-blobs',

// This endpoint is limited to something like 1 request every 5 seconds
const SCANNER_WAIT = 5000 / config.STEAM_API_HOST.split(',').length;
const blobArchive = new Archive('blob');

// We can stop at approximately 6400000000 (Feb 2024)
async function scanApi() {
  while (true) {
    let nextSeqNum = Number(fs.readFileSync('./match_seq_num.txt')) || 0;
    if (nextSeqNum > 6400000000) {
      process.exit(0);
    }
    const container = generateJob('api_sequence', {
      start_at_match_seq_num: nextSeqNum,
    });
    let data = null;
    try {
      data = await getSteamAPIData({
        url: container.url,
        // To use proxy we need to also set STEAM_API_HOST env var
      });
    } catch (err: any) {
      console.log(err);
      // unretryable steam error
      //   if (err?.result?.status === 2) {
      //     nextSeqNum += 1;
      // }
        await new Promise((resolve) =>
        setTimeout(
          resolve,
          SCANNER_WAIT,
        ),
      );
      continue;
    }
    const resp =
      data && data.result && data.result.matches ? data.result.matches : [];
    console.log('[API] match_seq_num:%s, matches:%s', nextSeqNum, resp.length);
    // write to blobstore, process the blob using same function as insertMatch
    try {
    const insertResult = await Promise.all(resp.map(async (origMatch: ApiMatch) => {
      const match = transformMatch(origMatch);
      // ifNotExists functionality not implemented by some s3 providers
      const result = await blobArchive.archivePut(match.match_id + '_api', Buffer.from(JSON.stringify(match)), false);
      if (!result) {
        throw new Error('failed to insert match ' + match.match_id);
      }
    }));
    if (resp.length) {
      nextSeqNum = resp[resp.length - 1].match_seq_num + 1;
      console.log('next_seq_num: %s', nextSeqNum);
      // Completed inserting matches on this page so update
      fs.writeFileSync('./match_seq_num.txt', nextSeqNum.toString());
    }
  } catch (e) {
    // If any fail, log the error and try the same number again
    console.error(e);
  }
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        SCANNER_WAIT,
      ),
    );
  }
}

async function start() {
  await scanApi();
}
start();
