import db from "./store/db.ts";
import redis, { redisCount } from "./store/redis.ts";
import { insertMatch } from "./util/insert.ts";
import { cacheTrackedPlayers } from "./util/queries.ts";
import { runInLoop } from "./store/queue.ts";

// Make sure we have tracked players loaded
const trackedExists = await redis.exists("tracked");
if (!trackedExists) {
  await cacheTrackedPlayers();
}

await runInLoop(async function insert() {
  const { rows } = await db.raw(
    "SELECT match_seq_num, data FROM insert_queue WHERE processed = FALSE ORDER BY match_seq_num ASC LIMIT 100",
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
  await Promise.race([
    Promise.allSettled(
      rows.map(async (r: any) => {
        const match = r.data;
        if (!match) {
          throw new Error("no match in row: %s", r.match_seq_num);
        }
        await insertMatch(match, {
          type: "api",
          origin: "scanner",
          skipRating,
          insertSeqNum: r.match_seq_num,
        });
      }),
    ),
    new Promise((resolve, reject) => {
      setTimeout(() => {
        // redisCount("inserter_timeout");
        reject(new Error("Request timed out"));
      }, 6000);
    }),
  ]);
}, 0);
