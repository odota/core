import config from '../config';
import { Archive } from './archive';
import {
  getFullPlayerMatchesWithMetadata,
  getMatchDataFromBlobWithMetadata,
} from './queries';
import db from './db';
import redis from './redis';
import cassandra from './cassandra';
import type { PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { isDataComplete, redisCount } from '../util/utility';
import QueryStream from 'pg-query-stream';
import { Client } from 'pg';
import crypto from 'crypto';

const matchArchive = new Archive('match');
const playerArchive = new Archive('player');

export async function doArchivePlayerMatches(
  accountId: number,
): Promise<PutObjectCommandOutput | null> {
  if (!config.ENABLE_PLAYER_ARCHIVE) {
    return null;
  }
  // Fetch our combined list of archive and current, selecting all fields
  const full = await getFullPlayerMatchesWithMetadata(accountId);
  const toArchive = full[0];
  console.log(full[1]);
  toArchive.forEach((m, i) => {
    Object.keys(m).forEach((key) => {
      if (m[key as keyof ParsedPlayerMatch] === null) {
        // Remove any null values from the matches for storage
        delete m[key as keyof ParsedPlayerMatch];
      }
    });
  });
  // TODO (howard) Make sure the new list is longer than the old list
  // Make sure we're archiving at least 1 match
  if (!toArchive.length) {
    return null;
  }
  // Put the blob
  return playerArchive.archivePut(
    accountId.toString(),
    Buffer.from(JSON.stringify(toArchive)),
  );
  // TODO (howard) delete the archived values from player_caches
  // TODO (howard) keep the 20 highest match IDs for recentMatches
  // TODO (howard) mark the user archived so we don't need to query archive on every request
  // TODO (howard) add redis counts
}

async function doArchiveFromBlob(matchId: number) {
  if (!config.ENABLE_MATCH_ARCHIVE) {
    return;
  }
  // Don't backfill when determining whether to archive
  const [match, metadata] = await getMatchDataFromBlobWithMetadata(
    matchId,
    false,
  );
  if (!match) {
    // Invalid/not found, skip
    return;
  }
  const isArchived = Boolean(
    (
      await db.raw(
        'select match_id from parsed_matches where match_id = ? and is_archived IS TRUE',
        [matchId],
      )
    ).rows[0],
  );
  if (isArchived) {
    console.log('ALREADY ARCHIVED match %s', matchId);
    await deleteMatch(matchId);
    return;
  }
  if (metadata?.has_api && !metadata?.has_gcdata && !metadata?.has_parsed) {
    // if it only contains API data, delete?
    // If the match is old we might not be able to get back ability builds, HD/TD/HH
    // We might also drop gcdata, identity, and ranks here
    // await deleteMatch(matchId);
    // console.log('DELETE match %s, apionly', matchId);
    return;
  }
  if (metadata?.has_parsed) {
    // check data completeness with isDataComplete
    if (!isDataComplete(match as ParsedMatch)) {
      redisCount(redis, 'incomplete_archive');
      console.log('INCOMPLETE match %s', matchId);
      return;
    }
    // TODO (howard) don't actually archive until verification of data format
    console.log('SIMULATE ARCHIVE match %s', matchId);
    return;
    // Archive the data since it's parsed. This might also contain api and gcdata
    const blob = Buffer.from(JSON.stringify(match));
    const result = await matchArchive.archivePut(matchId.toString(), blob);
    if (result) {
      redisCount(redis, 'match_archive_write');
      // Mark the match archived
      await db.raw(
        `UPDATE parsed_matches SET is_archived = TRUE WHERE match_id = ?`,
        [matchId],
      );
      // Delete the row (there might be other columns, but we'll have it all in the archive blob)
      // This will also also clear the gcdata cache for this match
      await deleteMatch(matchId);
      console.log('ARCHIVE match %s, parsed', matchId);
    }
    return result;
  }
  // if it's something else, e.g. contains api and gcdata only, leave it for now
  console.log('SKIP match %s, other', matchId);
  return;
}

async function deleteMatch(matchId: number) {
  await cassandra.execute(
    'DELETE from match_blobs WHERE match_id = ?',
    [matchId],
    {
      prepare: true,
    },
  );
}

export async function archivePostgresStream() {
  const max = await getCurrentMaxArchiveID();
  const query = new QueryStream(`
  SELECT match_id 
  from parsed_matches 
  WHERE is_archived IS NULL 
  and match_id < ? 
  ORDER BY match_id asc`,
   [max]);
  const pg = new Client(config.POSTGRES_URL);
  await pg.connect();
  const stream = pg.query(query);
  let i = 0;
  stream.on('readable', async () => {
    let row;
    while ((row = stream.read())) {
      i += 1;
      console.log(i);
      try {
        await doArchiveFromBlob(row.match_id);
      } catch (e) {
        console.error(e);
      }
    }
  });
  stream.on('end', async () => {
    await pg.end();
  });
}

async function archiveSequential(start: number, max: number) {
  // Archive sequentially starting at a given ID
  for (let i = start; i < max; i++) {
    console.log(i);
    try {
      await doArchiveFromBlob(i);
    }
    catch (e) {
      console.error(e);
    }
  }
}

async function archiveRandom(max: number) {
  const rand = randomInt(0, max);
  // Bruteforce 1000 IDs starting at a random value
  const page = [];
  for (let i = 0; i < 1000; i++) {
    page.push(rand + i);
  }
  console.log(page[0]);
  await Promise.allSettled(page.map(i => doArchiveFromBlob(i)));
}

export async function archiveToken(max: number) {
  let page = await getTokenRange(1000);
  page = page.filter(id => id < max);
  console.log(page[0]);
  await Promise.allSettled(page.map(i => doArchiveFromBlob(i)));
}

function randomBigInt(byteCount: number) {
  return BigInt(`0x${crypto.randomBytes(byteCount).toString('hex')}`);
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

export async function getCurrentMaxArchiveID() {
  // Get the current max_match_id from postgres, subtract 200000000
  const max = (await db.raw('select max(match_id) from public_matches'))
    ?.rows?.[0]?.max;
  const limit = max - 200000000;
  return limit;
}

async function getTokenRange(size: number) {
  // Convert to signed 64-bit integer
  const signedBigInt = BigInt.asIntN(64, randomBigInt(8));
  // Get a page of matches (efffectively random, but guaranteed sequential read on one node)
  const result = await cassandra.execute(
    'select match_id, token(match_id) from match_blobs where token(match_id) >= ? limit ? ALLOW FILTERING;',
    [signedBigInt.toString(), size],
    {
      prepare: true,
      fetchSize: size,
      autoPage: true,
    },
  );
  return result.rows.map(row => Number(row.match_id));
}

export async function readArchivedPlayerMatches(
  accountId: number,
): Promise<ParsedPlayerMatch[]> {
  console.time('archive:' + accountId);
  const blob = await playerArchive.archiveGet(accountId.toString());
  const arr = blob ? JSON.parse(blob.toString()) : [];
  console.timeEnd('archive:' + accountId);
  return arr;
}

/**
 * Return parsed data by reading from the archive.
 * @param matchId
 * @returns
 */
export async function tryReadArchivedMatch(
  matchId: number,
): Promise<ParsedMatch | undefined> {
  try {
    if (!config.ENABLE_MATCH_ARCHIVE) {
      return;
    }
    // Check if the parsed data is archived
    // Most matches won't be in the archive so it's more efficient not to always try
    const isArchived = Boolean(
      (
        await db.raw(
          'select match_id from parsed_matches where match_id = ? and is_archived IS TRUE',
          [matchId],
        )
      ).rows[0],
    );
    if (!isArchived) {
      return;
    }
    const blob = await matchArchive.archiveGet(matchId.toString());
    const result: ParsedMatch | null = blob
      ? JSON.parse(blob.toString())
      : null;
    if (result) {
      redisCount(redis, 'match_archive_read');
      return result;
    }
  } catch (e) {
    console.error(e);
  }
  return;
}
