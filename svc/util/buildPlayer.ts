import util from "node:util";
import config from "../../config.ts";
import { filterMatches } from "./filter.ts";
import redis, { redisCount, redisCountDistinct } from "../store/redis.ts";
import cassandra, { getCassandraColumns } from "../store/cassandra.ts";
import { deserialize, pick } from "./utility.ts";
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { cacheableCols } from "../api/playerFields.ts";
import fs from "node:fs/promises";

export async function getPlayerMatches(
  accountId: number,
  queryObj: QueryObj,
): Promise<ParsedPlayerMatch[]> {
  // Validate accountId
  if (!accountId || !Number.isInteger(accountId) || accountId <= 0) {
    return [];
  }
  if (queryObj.isPrivate) {
    // User disabled public match history from Dota, so don't return matches
    return [];
  }
  redisCount("player_matches");
  const columns = await getCassandraColumns("player_caches");
  const sanitizedProject = queryObj.project.filter((f: string) => columns[f]);
  const projection = queryObj.projectAll ? ["*"] : sanitizedProject;

  const canUseTemp =
    config.ENABLE_PLAYER_CACHE &&
    !Boolean(queryObj.dbLimit) &&
    projection.every((field) => cacheableCols.has(field as any));
  // Don't use temp table if dbLimit (recentMatches) or projectAll
  // Check if every requested column can be satisified by temp
  const matches = canUseTemp
    ? await readPlayerTemp(accountId, projection)
    : await readPlayerCaches(accountId, projection, queryObj.dbLimit);
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
  return final;
}

async function readPlayerTemp(
  accountId: number,
  project: string[],
): Promise<ParsedPlayerMatch[]> {
  let result = null;
  try {
    result = await fs.readFile("./cache/" + accountId);
  } catch {
    // Might not exist, so just ignore
  }
  if (result) {
    redisCount("player_temp_hit");
    redisCountDistinct("distinct_player_temp", accountId.toString());
    const decomp = zstdDecompressSync(result).toString();
    const output = JSON.parse(decomp);
    // Remove columns not asked for
    return output.map((m: any) => pick(m, project));
  } else {
    // Uses the imprecise lock algorithm described in https://redis.io/commands/setnx/
    // A client might delete the lock held by another client in the case of the population taking more than the timeout time
    // This is because we use del to release rather than delete only if matches random value
    // But that's ok since this is just an optimization to reduce load
    const lock = await redis.set(
      "player_temp_lock:" + accountId.toString(),
      Date.now().toString(),
      "EX",
      10,
      "NX",
    );
    if (!lock) {
      redisCount("player_temp_wait");
      // console.log('[PLAYERCACHE] waiting for lock on %s', accountId);
      // Couldn't acquire the lock, wait and try again
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return readPlayerTemp(accountId, project);
    }
    const result = await populateTemp(accountId, project);
    // Release the lock
    await redis.del("player_temp_lock:" + accountId.toString());
    if (result.length >= Number(config.PLAYER_CACHE_THRESHOLD)) {
      // Should have cached since large
      redisCount("player_temp_miss");
    } else {
      // Small read anyway so don't need to use cache
      redisCount("player_temp_skip");
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
      const comp = zstdCompressSync(JSON.stringify(all));
      redisCount("player_temp_write");
      redisCount("player_temp_write_bytes", comp.length);
      await fs.mkdir("./cache", { recursive: true });
      await fs.writeFile("./cache/" + accountId, comp);
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
      ${limit ? `LIMIT ${limit}` : ""}
    `,
    project.join(","),
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
