import util from 'util';
import config from '../config';
import { filterMatches } from './filter';
import redis from '../store/redis';
import cassandra, { getCassandraColumns } from '../store/cassandra';
import { deserialize, pick, redisCount, redisCountDistinct } from './utility';
import { gzipSync, gunzipSync } from 'zlib';
import { cacheableCols } from '../routes/playerFields';
import { promises as fs } from 'fs';
import { playerArchive } from '../store/archive';

export async function getPlayerMatches(
  accountId: number,
  queryObj: QueryObj,
): Promise<ParsedPlayerMatch[]> {
  return (await getPlayerMatchesWithMetadata(accountId, queryObj))[0];
}

type PlayerMatchesMetadata = {
  finalLength: number;
  localLength: number;
  archivedLength: number;
  mergedLength: number;
};

export async function getPlayerMatchesWithMetadata(
  accountId: number,
  queryObj: QueryObj,
): Promise<[ParsedPlayerMatch[], PlayerMatchesMetadata | null]> {
  // Validate accountId
  if (!accountId || !Number.isInteger(accountId) || accountId <= 0) {
    return [[], null];
  }
  if (queryObj.isPrivate) {
    // User disabled public match history from Dota, so don't return matches
    return [[], null];
  }
  redisCount('player_matches');
  const columns = await getCassandraColumns('player_caches');
  const sanitizedProject = queryObj.project.filter((f: string) => columns[f]);
  const projection = queryObj.projectAll ? ['*'] : sanitizedProject;

  // Archive model
  // For inactive, unvisited players with a large number of matches, get all columns for their player_caches and store in single blob in archive
  // Record some metadata indicating this player is archived
  // Delete the data from player_caches
  // On read, check metadata to see whether this player is archived
  // if so reinsert the data into player_caches from archive
  // Maybe want to track the reinsert time as well so we don't fetch and merge from archive every time?
  // maybe we can merge rows on reinsert? But need to decide whether to keep current or archived if both are present, use in-memory merge
  // Background process continually rechecks for players eligible to be archived and re-archives the data from player_caches
  // This should help keep player_caches size under control (and may avoid the need to maintain player_temp)

  const canUseTemp =
    config.ENABLE_PLAYER_CACHE &&
    !Boolean(queryObj.dbLimit) &&
    projection.every((field) => cacheableCols.has(field as any));
  // Don't use temp table if dbLimit (recentMatches) or projectAll (archiving)
  // Check if every requested column can be satisified by temp
  const localMatches = canUseTemp
    ? await readPlayerTemp(accountId, projection)
    : await readPlayerCaches(accountId, projection, queryObj.dbLimit);
  // if dbLimit (recentMatches), don't use archive
  const archivedMatches =
    config.ENABLE_PLAYER_ARCHIVE && !queryObj.dbLimit
      ? await readArchivedPlayerMatches(accountId)
      : [];
  const localLength = localMatches.length;
  const archivedLength = archivedMatches.length;

  const keys = queryObj.projectAll
    ? (Object.keys(columns) as (keyof ParsedPlayerMatch)[])
    : queryObj.project;
  // Merge the two sets of matches
  let matches = mergeMatches(localMatches, archivedMatches, keys);
  const filtered = filterMatches(matches, queryObj.filter);
  const sort = queryObj.sort;
  if (sort) {
    filtered.sort((a, b) => b[sort] - a[sort]);
  } else {
    // Default sort by match_id desc
    filtered.sort((a, b) => b.match_id - a.match_id);
  }
  const offset = filtered.slice(queryObj.offset || 0);
  const final = offset.slice(0, queryObj.limit || offset.length);
  return [
    final,
    {
      finalLength: final.length,
      localLength,
      archivedLength,
      mergedLength: matches.length,
    },
  ];
}

function mergeMatches(
  localMatches: ParsedPlayerMatch[],
  archivedMatches: ParsedPlayerMatch[],
  keys: (keyof ParsedPlayerMatch)[],
): ParsedPlayerMatch[] {
  if (archivedMatches.length) {
    const matches: ParsedPlayerMatch[] = [];
    // Merge together the results
    // Sort both lists into descending order
    localMatches.sort((a, b) => b.match_id - a.match_id);
    archivedMatches.sort((a, b) => b.match_id - a.match_id);
    while (localMatches.length || archivedMatches.length) {
      const localMatch = localMatches[0];
      const archivedMatch = archivedMatches[0];
      // If the IDs of the first elements match, pop both and then merge them together
      if (localMatch?.match_id === archivedMatch?.match_id) {
        // Only pick selected columns from those matches
        // Local match has the desired columns
        Object.keys(localMatch).forEach((key) => {
          const typedKey = key as keyof ParsedPlayerMatch;
          // For each key prefer nonnull value, with precedence to local store
          //@ts-ignore
          localMatch[typedKey] =
            localMatch[typedKey] ?? archivedMatch[typedKey] ?? null;
        });
        // Output the merged version
        matches.push(localMatch);
        // Pop both from array
        localMatches.shift();
        archivedMatches.shift();
      } else {
        // Otherwise just push the higher ID element into the merge
        if ((localMatch?.match_id ?? 0) > (archivedMatch?.match_id ?? 0)) {
          matches.push(localMatches.shift()!);
        } else {
          // Pick only specified columns of the archived match
          matches.push(pick(archivedMatches.shift(), keys));
        }
      }
    }
  }
  return localMatches;
}

async function readPlayerTemp(
  accountId: number,
  project: string[],
): Promise<ParsedPlayerMatch[]> {
  let result = null;
  try {
    result = await fs.readFile('./cache/' + accountId);
  } catch {
    // Might not exist, so just ignore
  }
  if (result) {
    redisCount('player_temp_hit');
    redisCountDistinct('distinct_player_temp', accountId.toString());
    const zip = gunzipSync(result).toString();
    const output = JSON.parse(zip);
    // Remove columns not asked for
    return output.map((m: any) => pick(m, project));
  } else {
    // Uses the imprecise lock algorithm described in https://redis.io/commands/setnx/
    // A client might delete the lock held by another client in the case of the population taking more than the timeout time
    // This is because we use del to release rather than delete only if matches random value
    // But that's ok since this is just an optimization to reduce load
    const lock = await redis.set(
      'player_temp_lock:' + accountId.toString(),
      Date.now().toString(),
      'EX',
      10,
      'NX',
    );
    if (!lock) {
      redisCount('player_temp_wait');
      // console.log('[PLAYERCACHE] waiting for lock on %s', accountId);
      // Couldn't acquire the lock, wait and try again
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return readPlayerTemp(accountId, project);
    }
    const result = await populateTemp(accountId, project);
    // Release the lock
    await redis.del('player_temp_lock:' + accountId.toString());
    if (result.length >= Number(config.PLAYER_CACHE_THRESHOLD)) {
      // Should have cached since large
      redisCount('player_temp_miss');
    } else {
      // Small read anyway so don't need to use cache
      redisCount('player_temp_skip');
    }
    return result;
  }
}

export async function populateTemp(
  accountId: number,
  project: string[],
): Promise<ParsedPlayerMatch[]> {
  // Populate cache with all columns result
  const all = await readPlayerCaches(accountId, Array.from(cacheableCols));
  if (all.length >= Number(config.PLAYER_CACHE_THRESHOLD)) {
    try {
      const zip = gzipSync(JSON.stringify(all));
      redisCount('player_temp_write');
      redisCount('player_temp_write_bytes', zip.length);
      await fs.mkdir('./cache', { recursive: true });
      await fs.writeFile('./cache/' + accountId, zip);
    } catch (e) {
      console.log(e);
      // We can ignore temp write exceptions
    }
  }
  return all.map((m: any) => pick(m, project));
}

async function readPlayerCaches(
  accountId: number,
  project: string[],
  limit?: number,
) {
  const query = util.format(
    `
      SELECT %s FROM player_caches
      WHERE account_id = ?
      ORDER BY match_id DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `,
    project.join(','),
  );
  return new Promise<ParsedPlayerMatch[]>((resolve, reject) => {
    let result: ParsedPlayerMatch[] = [];
    cassandra.eachRow(
      query,
      [accountId],
      {
        prepare: true,
        fetchSize: 1000,
        autoPage: true,
      },
      (n, row) => {
        const m = deserialize(row);
        result.push(m);
      },
      (err) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      },
    );
  });
}

export async function getFullPlayerMatchesWithMetadata(
  accountId: number,
): Promise<[ParsedPlayerMatch[], PlayerMatchesMetadata | null]> {
  return getPlayerMatchesWithMetadata(accountId, {
    project: [],
    projectAll: true,
  });
}

async function readArchivedPlayerMatches(
  accountId: number,
): Promise<ParsedPlayerMatch[]> {
  if (!playerArchive) {
    return [];
  }
  console.time('archive:' + accountId);
  const blob = await playerArchive.archiveGet(accountId.toString());
  const arr = blob ? JSON.parse(blob.toString()) : [];
  console.timeEnd('archive:' + accountId);
  return arr;
}