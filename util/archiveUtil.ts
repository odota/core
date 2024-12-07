import config from '../config';
import { Archive } from '../store/archive';
import {
  getFullPlayerMatchesWithMetadata,
} from './queries';
import cassandra from '../store/cassandra';
import type { PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { isDataComplete, redisCount } from '../util/utility';
import QueryStream from 'pg-query-stream';
import { Client } from 'pg';
import crypto from 'crypto';
import db from '../store/db';
import { ApiFetcher } from '../fetcher/getApiData';
import { GcdataFetcher } from '../fetcher/getGcData';
import { ParsedFetcher } from '../fetcher/getParsedData';
import { getMatchDataFromBlobWithMetadata } from './buildMatch';

const apiFetcher = new ApiFetcher();
const gcFetcher = new GcdataFetcher();
const parsedFetcher = new ParsedFetcher();

const matchArchive = config.ENABLE_MATCH_ARCHIVE ? new Archive('match') : null;
const playerArchive = config.ENABLE_PLAYER_ARCHIVE
  ? new Archive('player')
  : null;
const blobArchive = new Archive('blob');

export async function processPlayerMatches(
  accountId: number,
): Promise<PutObjectCommandOutput | { message: string } | null> {
  if (!playerArchive) {
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

async function processMatch(matchId: number) {
  // Check if we should archive the blobs (should be parsed and not archived)
  // const isParsed = await checkIsParsed(matchId);
  // if (isParsed) {
  //   const isArchived = await checkIsArchived(matchId);
  //   if (isArchived) {
  //     console.log('ALREADY ARCHIVED match %s', matchId);
  //     await deleteMatch(matchId);
  //     return;
  //   }
  //   await doArchiveMatchFromBlobs(matchId);
  // }
  // TODO remove this after backfill complete
  // Avoid migrating matches in the "critical range" where we're backfilling
  // We want to avoid overwriting ability upgrades data with less complete data from the API
  // If past the high value, we won't be scanning that far
  // If lower than low value, we won't have ability upgrades anyway
  if (matchId > 7300000000 && matchId < 7600000000) {
    return;
  }
  await doMigrateMatchToBlobStore(matchId);
}

/**
 * Consolidates separate match data blobs and stores as a single blob in archive
 * @param matchId
 * @returns
 */
async function doArchiveMatchFromBlobs(matchId: number) {
  if (!matchArchive) {
    return;
  }
  // Don't read from archive when determining whether to archive
  const [match, metadata] = await getMatchDataFromBlobWithMetadata(matchId, {
    noArchive: true,
    // Remove noBlobStore once migrated
    noBlobStore: true,
  });
  if (match && metadata?.has_parsed) {
    // check data completeness with isDataComplete
    if (!isDataComplete(match as ParsedMatch)) {
      redisCount('incomplete_archive');
      console.log('INCOMPLETE skipping match %s', matchId);
      return;
    }
    // Archive the data since it's parsed. This might also contain api and gcdata
    const blob = Buffer.from(JSON.stringify(match));
    const result = await matchArchive?.archivePut(matchId.toString(), blob);
    if (result) {
      // Mark the match archived
      await db.raw(
        `UPDATE parsed_matches SET is_archived = TRUE WHERE match_id = ?`,
        [matchId],
      );
      await deleteMatch(matchId);
      console.log('ARCHIVE match %s, parsed', matchId);
    }
    return result;
  }
}

/**
 * Moves individual match blobs from Cassandra to blob store
 * @param matchId
 * @returns
 */
async function doMigrateMatchToBlobStore(matchId: number) {
  const api = await apiFetcher.readData(matchId, true);
  const gcdata = await gcFetcher.readData(matchId, true);
  const parsed = await parsedFetcher.readData(matchId, true);
  if (api) {
    // If the match is old we might not be able to get back ability builds, HD/TD/HH from Steam so we want to keep the API data
    await blobArchive.archivePut(
      matchId.toString() + '_api',
      Buffer.from(JSON.stringify(api)),
    );
  }
  if (gcdata) {
    await blobArchive.archivePut(
      matchId.toString() + '_gcdata',
      Buffer.from(JSON.stringify(gcdata)),
    );
  }
  if (parsed) {
    await blobArchive.archivePut(
      matchId.toString() + '_parsed',
      Buffer.from(JSON.stringify(parsed)),
    );
  }
  await deleteMatch(matchId);
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
  // Archive parsed matches that aren't archived from postgres records
  const query = new QueryStream(
    `
    SELECT match_id 
    from parsed_matches 
    WHERE is_archived IS NULL
    ORDER BY match_id asc`,
    [],
  );
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
        await processMatch(row.match_id);
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
  // Archive sequentially starting at a given ID (not all IDs may be valid)
  for (let i = start; i < max; i++) {
    console.log(i);
    try {
      await processMatch(i);
    } catch (e) {
      console.error(e);
    }
  }
}

async function archiveRandom(max: number) {
  const rand = randomInt(0, max);
  // Bruteforce 1000 IDs starting at a random value (not all IDs may be valid)
  const page = [];
  for (let i = 0; i < 1000; i++) {
    page.push(rand + i);
  }
  console.log(page[0]);
  await Promise.allSettled(page.map((i) => processMatch(i)));
}

export async function archiveToken(max?: number) {
  // Archive random matches from Cassandra using token range (not all may be parsed)
  let page = await getTokenRange(100);
  if (max) {
    page = page.filter((id) => id < max);
  }
  console.log(page[0]);
  await Promise.allSettled(page.map((i) => processMatch(i)));
}

function randomBigInt(byteCount: number) {
  return BigInt(`0x${crypto.randomBytes(byteCount).toString('hex')}`);
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

export async function getCurrentMaxArchiveID() {
  const max = (await db.raw('select max(match_id) from public_matches'))
    ?.rows?.[0]?.max;
  const limit = max - 100000000;
  return limit;
}

async function getTokenRange(size: number) {
  // Convert to signed 64-bit integer
  const signedBigInt = BigInt.asIntN(64, randomBigInt(8));
  // Get a page of matches (effectively random, but guaranteed sequential read on one node)
  const result = await cassandra.execute(
    'select match_id, token(match_id) from match_blobs where token(match_id) >= ? limit ? ALLOW FILTERING;',
    [signedBigInt.toString(), size],
    {
      prepare: true,
      fetchSize: size,
      autoPage: true,
    },
  );
  return result.rows.map((row) => Number(row.match_id));
}
