import config from '../../config.ts';
import { matchArchive, playerArchive } from '../store/archive.ts';
import QueryStream from 'pg-query-stream';
import { Client } from 'pg';
import db from '../store/db.ts';
import { getFullPlayerMatchesWithMetadata } from './buildPlayer.ts';
import { isDataComplete, randomInt } from './utility.ts';
import { getMatchBlob } from './getMatchBlob.ts';
import { ApiFetcher } from '../fetcher/ApiFetcher.ts';
import { ParsedFetcher } from '../fetcher/ParsedFetcher.ts';
import { GcdataFetcher } from '../fetcher/GcdataFetcher.ts';
import { redisCount } from '../store/redis.ts';

// Don't include archive when archiving
const fetchers = {
  apiFetcher: new ApiFetcher(),
  gcFetcher: new GcdataFetcher(),
  parsedFetcher: new ParsedFetcher(),
  archivedFetcher: null,
};

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
        console.log(e);
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
      console.log(e);
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

export async function getCurrentMaxArchiveID() {
  const max = (await db.raw('select max(match_id) from public_matches'))
    ?.rows?.[0]?.max;
  const limit = max - 100000000;
  return limit;
}

async function doArchivePlayerMatches(accountId: number): Promise<void> {
  if (!playerArchive) {
    return;
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
    return;
  }
  // Put the blob
  await playerArchive.archivePut(
    accountId.toString(),
    Buffer.from(JSON.stringify(toArchive)),
  );
  return;
  // TODO (howard) delete the archived values from player_caches
  // TODO (howard) keep the 20 highest match IDs for recentMatches
  // TODO (howard) mark the user archived so we don't need to query archive on every request
  // TODO (howard) add redis counts
}

/**
 * Consolidates separate match data blobs and stores as a single blob in archive
 * @param matchId
 * @returns
 */
export async function doArchiveMatchFromBlobs(matchId: number) {
  // Don't read from archive when determining whether to archive
  const [match, metadata] = await getMatchBlob(matchId, fetchers);
  if (match && metadata?.has_parsed) {
    // check data completeness with isDataComplete
    if (!isDataComplete(match as ParsedMatch)) {
      redisCount('incomplete_archive');
      console.log('INCOMPLETE skipping match %s', matchId);
      return;
    }
    // Archive the data since it's parsed. This might also contain api and gcdata
    const blob = Buffer.from(JSON.stringify(match));
    const result = await matchArchive.archivePut(matchId.toString(), blob);
    if (result) {
      // Mark the match archived
      await db.raw(
        `UPDATE parsed_matches SET is_archived = TRUE WHERE match_id = ?`,
        [matchId],
      );
      // TODO delete blobs
      // await deleteMatch(matchId);
      console.log('ARCHIVE match %s, parsed', matchId);
    }
    return result;
  }
}
