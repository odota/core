import db from "./store/db.ts";
import redis from "./store/redis.ts";
import { insertMatch } from "./util/insert.ts";
import { cacheTrackedPlayers } from "./util/queries.ts";
import { runInLoop } from "./store/queue.ts";

// Make sure we have tracked players loaded
// Wait to avoid excessively fast restart loop if services aren't up yet
await new Promise((resolve) => setTimeout(resolve, 500));
const trackedExists = await redis.exists("tracked");
if (!trackedExists) {
  await cacheTrackedPlayers();
}

await runInLoop(async function insert() {
  const { rows } = await db.raw(
    "SELECT match_seq_num, data FROM insert_queue WHERE processed = FALSE ORDER BY match_seq_num ASC LIMIT 200",
  );
  if (!rows.length) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }
  // Check if we should do rating (if parse queue isn't long)
  const threshold = 1000;
  const cappedCount = await db.raw(
    `SELECT COUNT(*) FROM (SELECT 1 FROM queue WHERE type = 'parse' LIMIT ?) subquery;`,
    [threshold],
  );
  const skipRating = cappedCount.rows[0].count >= threshold;
  await Promise.all(
    rows.map(async (r: any) => {
      const match = r.data;
      if (match) {
        // console.log(match);
        await insertMatch(match, {
          type: "api",
          origin: "scanner",
          skipRating,
        });
      }
      await db.raw(
        "UPDATE insert_queue SET processed = TRUE WHERE match_seq_num = ?",
        [r.match_seq_num],
      );
    }),
  );
}, 0);
