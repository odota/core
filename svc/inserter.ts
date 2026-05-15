import config from "../config.ts";
import db from "./store/db.ts";
import redis, { redisCount } from "./store/redis.ts";
import { insertMatch } from "./util/insert.ts";
import { cacheTrackedPlayers } from "./util/queries.ts";
import { runInLoop } from "./store/queue.ts";

const batchSize = Math.max(1, Number(config.INSERTER_BATCH_SIZE) || 100);
const parallelism = Math.max(1, Number(config.INSERTER_PARALLELISM) || 100);

// Make sure we have tracked players loaded
const trackedExists = await redis.exists("tracked");
if (!trackedExists) {
  await cacheTrackedPlayers();
}

await runInLoop(async function insert() {
  const { rows } = await db.raw(
    "SELECT match_seq_num, data FROM insert_queue WHERE processed = FALSE ORDER BY match_seq_num ASC LIMIT ?",
    [batchSize],
  );
  if (!rows.length) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }
  // Check if we should do rating (if queue isn't long)
  const threshold = 1000;
  const cappedCount = await db.raw(
    `SELECT COUNT(*) FROM (SELECT 1 FROM queue WHERE type = 'gcdata' LIMIT ?) subquery;`,
    [threshold],
  );
  const skipRating = cappedCount.rows[0].count >= threshold;
  const timeout = setTimeout(() => {
    redisCount("inserter_timeout");
    process.exit(1);
  }, 10000);
  try {
    for (let offset = 0; offset < rows.length; offset += parallelism) {
      const chunk = rows.slice(offset, offset + parallelism);
      const settled = await Promise.allSettled(
        chunk.map(async (r: { match_seq_num: number; data: unknown }) => {
          const match = r.data;
          if (!match) {
            throw new Error(`no match in row: ${r.match_seq_num}`);
          }
          await insertMatch(match as InsertMatchInput, {
            type: "api",
            origin: "scanner",
            skipRating,
            insertSeqNum: r.match_seq_num,
          });
        }),
      );
      for (const s of settled) {
        if (s.status === "rejected") {
          console.log(s.reason);
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}, 0);
