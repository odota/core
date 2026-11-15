import config from "../config.ts";
import db from "./store/db.ts";
import redis, { redisCount } from "./store/redis.ts";
import { insertMatch } from "./util/insert.ts";
import { cacheTrackedPlayers } from "./util/queries.ts";

// Make sure we have tracked players loaded
const trackedExists = await redis.exists("tracked");
if (!trackedExists) {
  await cacheTrackedPlayers();
}

const parallelism = 75;
const skipRating = false;
const inFlight = new Map<number, Promise<void>>();

function startJob(r: { match_seq_num: number; data: any }) {
  const seqNum = r.match_seq_num;
  const timeout = setTimeout(() => {
    redisCount("inserter_timeout");
    console.error(`insert job ${seqNum} timed out after 30s`);
    process.exit(1);
  }, 30000);
  const promise = (async () => {
    try {
      const match = r.data;
      if (!match) {
        throw new Error("no match in row " + seqNum);
      }
      await insertMatch(match, {
        type: "api",
        origin: "scanner",
        skipRating,
        insertSeqNum: seqNum,
      });
    } catch (e) {
      console.error(e);
    } finally {
      clearTimeout(timeout);
      inFlight.delete(seqNum);
    }
  })();
  inFlight.set(seqNum, promise);
}

while (true) {
  const start = Date.now();
  if (inFlight.size >= parallelism) {
    await Promise.race(inFlight.values());
  } else {
    const limit = parallelism - inFlight.size;
    const activeSeqNums = Array.from(inFlight.keys());
    const { rows } = await db.query(
      "SELECT match_seq_num, data FROM insert_queue WHERE processed = FALSE AND match_seq_num != ALL($1::bigint[]) ORDER BY match_seq_num ASC LIMIT $2",
      [activeSeqNums, limit],
    );
    for (const r of rows) {
      startJob(r);
    }
    if (inFlight.size >= parallelism) {
      await Promise.race(inFlight.values());
    } else if (rows.length < limit) {
      const delay = new Promise<void>((resolve) => setTimeout(resolve, 1000));
      if (inFlight.size > 0) {
        await Promise.race([...inFlight.values(), delay]);
      } else {
        await delay;
      }
    }
  }
  try {
    await redis.setex(
      "lastRun:" + config.APP_NAME,
      config.HEALTH_TIMEOUT,
      Date.now() - start,
    );
  } catch (e) {
    console.log("Failed to update Redis with lastRun");
  }
}
