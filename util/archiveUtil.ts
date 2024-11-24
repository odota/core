import config from '../config';
import { Archive } from '../store/archive';
import {
  getFullPlayerMatchesWithMetadata,
  getMatchDataFromBlobWithMetadata,
} from '../store/queries';
import cassandra from '../store/cassandra';
import type { PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { isDataComplete, redisCount } from '../util/utility';
import QueryStream from 'pg-query-stream';
import { Client } from 'pg';
import crypto from 'crypto';
import db from '../store/db';
import { readApiData } from '../store/getApiData';
import { readGcData } from '../store/getGcData';
import { checkIsParsed } from '../store/getParsedData';
import { checkIsArchived } from '../store/getArchivedData';

const matchArchive = config.ENABLE_MATCH_ARCHIVE ? new Archive('match') : null;
const playerArchive = config.ENABLE_PLAYER_ARCHIVE
  ? new Archive('player')
  : null;
const blobArchive = config.ENABLE_BLOB_ARCHIVE ? new Archive('blob') : null;

export async function doArchivePlayerMatches(
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

async function doCleanupMatch(matchId: number) {
  // Check if we should archive the blobs (should be parsed and not archived)
  const isParsed = await checkIsParsed(matchId);
  if (isParsed) {
    const isArchived = await checkIsArchived(matchId);
    if (isArchived) {
      console.log('ALREADY ARCHIVED match %s', matchId);
      await deleteMatch(matchId);
      return;
    }
    await doArchiveMatchFromBlobs(matchId);
  } else {
    if (matchId > 8000000000) {
      // Don't run on recent matches to avoid splitting data between stores (in case we hit this while parsing a match)
      return;
    }
    // Check if we should migrate the blob
    await doMigrateMatchToBlobStore(matchId);
    // Check if we can clean up the whole row
    await doCleanupCassandraBlobRows(matchId);
  }
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
    noBlobStore: true,
  });
  if (match && metadata?.has_parsed) {
    // check data completeness with isDataComplete
    if (!isDataComplete(match as ParsedMatch)) {
      redisCount('incomplete_archive');
      console.log('INCOMPLETE skipping match %s', matchId);
      return;
    }
    redisCount('match_archive_write');
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
  const api = await readApiData(matchId, true);
  const gcdata = await readGcData(matchId, true);
  // migrate the api data
  if (api) {
    // If the match is old we might not be able to get back ability builds, HD/TD/HH from Steam so we want to keep the API data
    const result = await blobArchive?.archivePut(
      matchId.toString() + '_api',
      Buffer.from(JSON.stringify(api)),
    );
    if (result) {
      console.log('SUCCESS BLOB api match %s', matchId);
      await cassandra.execute(
        'DELETE api from match_blobs WHERE match_id = ?',
        [matchId],
        {
          prepare: true,
        },
      );
    } else {
      console.log('FAILED BLOB api match %s', matchId);
    }
  }
  if (gcdata) {
    //   const result = await blobArchive?.archivePut(matchId.toString() + '_gcdata', Buffer.from(JSON.stringify(gcdata)));
    //   if (result) {
    //     console.log('SUCCESS BLOB gcdata match %s', matchId);
    // await cassandra.execute(
    //   'DELETE gcdata from match_blobs WHERE match_id = ?',
    //   [matchId],
    //   {
    //     prepare: true,
    //   },
    // );
    //   } else {
    //     console.log('FAILED BLOB gcdata match %s', matchId);
    //     return;
    //   }
  }
  // there may be rows left with only gcdata that we can migrate at a later point
}

/**
 * Removes empty rows from Cassandra after we've moved the blobs
 */
async function doCleanupCassandraBlobRows(matchId: number) {
  const api = await readApiData(matchId, true);
  const gcdata = await readGcData(matchId, true);
  const isParsed = await checkIsParsed(matchId);
  if (!api && !gcdata && !isParsed) {
    await deleteMatch(matchId);
  }
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

export async function archivePostgresStream(max: number) {
  // Archive parsed matches that aren't archived from postgres records
  const query = new QueryStream(
    `
    SELECT match_id 
    from parsed_matches 
    WHERE is_archived IS NULL 
    and match_id < ? 
    ORDER BY match_id asc`,
    [max],
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
        await doCleanupMatch(row.match_id);
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
      await doCleanupMatch(i);
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
  await Promise.allSettled(page.map((i) => doCleanupMatch(i)));
}

export async function archiveToken(max: number) {
  // Archive random matches from Cassandra using token range (not all may be parsed)
  let page = await getTokenRange(1000);
  page = page.filter((id) => id < max);
  console.log(page[0]);
  await Promise.allSettled(page.map((i) => doCleanupMatch(i)));
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
