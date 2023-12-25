// Cleans up old data from Cassandra and optionally archives it
import crypto from 'crypto';
import cassandra from '../store/cassandra';
import db from '../store/db';
import { doArchiveFromLegacy } from '../store/getArchivedData';

function randomBigInt(byteCount: number, radix: number): string {
  return BigInt(`0x${crypto.randomBytes(byteCount).toString('hex')}`).toString(
    radix,
  );
}

async function getCurrentMaxArchiveID() {
  // Get the current max_match_id from postgres, subtract 200000000
  const max = (await db.raw('select max(match_id) from public_matches'))
    ?.rows?.[0]?.max;
  const limit = max - 200000000;
  return limit;
}

async function getRandomPage(size: number) {
  // Convert to signed bigint
  const signedBigInt = BigInt.asIntN(64, BigInt(randomBigInt(8, 10)));
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

function randomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

async function start() {
  // TODO (archiveblob) Implement a cleanup for the blobstore to remove unparsed matches and archive parsed ones
  while (true) {
    const rand = randomNumber(1, 7500000000);
    const page = [];
    for (let i = 0; i < 500; i++) {
      page.push(rand + i);
    }
    console.log(page[0]);
    await Promise.all(page.map(i => doArchiveFromLegacy(i)));
  }
}
start();
