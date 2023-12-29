// Cleans up old data from Cassandra and optionally archives it
import crypto from 'crypto';
import cassandra from '../store/cassandra';
import db from '../store/db';
import { doArchiveFromLegacy } from '../store/getArchivedData';

function randomBigInt(byteCount: number) {
  return BigInt(`0x${crypto.randomBytes(byteCount).toString('hex')}`);
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

async function getCurrentMaxArchiveID() {
  // Get the current max_match_id from postgres, subtract 200000000
  const max = (await db.raw('select max(match_id) from public_matches'))
    ?.rows?.[0]?.max;
  const limit = max - 200000000;
  return limit;
}

async function getRandomPage(size: number) {
  // Convert to signed 64-bit integer
  const signedBigInt = BigInt.asIntN(64, randomBigInt(8));
  const result = await cassandra.execute(
    'select match_id, token(match_id) from matches where token(match_id) >= ? limit ? ALLOW FILTERING;',
    [signedBigInt.toString(), size],
    {
      prepare: true,
      fetchSize: size,
      autoPage: true,
    },
  );
  return result.rows.map(row => row.match_id);
}

async function start() {
  // TODO (archiveblob) Implement a cleanup for the blobstore to remove unparsed matches and archive parsed ones
  while (true) {
    try {
      const rand = randomInt(1000000000, 6300000000);
      const page = [];
      for (let i = 0; i < 500; i++) {
        page.push(rand + i);
      }
      console.log(page[0]);
      await Promise.allSettled(page.map(i => doArchiveFromLegacy(i)));
    } catch (e) {
      console.error(e);
    }
  }
}
start();
