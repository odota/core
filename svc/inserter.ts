import db from "./store/db.ts";
import redis from "./store/redis.ts";
import { insertMatch } from "./util/insert.ts";
import { cacheTrackedPlayers } from "./util/queries.ts";
import { runInLoop } from "./util/utility.ts";

// Make sure we have tracked players loaded
const trackedExists = await redis.exists("tracked");
if (!trackedExists) {
  await cacheTrackedPlayers();
}

await runInLoop(async function insert() {
  const { rows } = await db.raw(
    "SELECT match_seq_num, data FROM insert_queue WHERE processed = FALSE ORDER BY match_seq_num ASC LIMIT 150",
  );
  if (!rows.length) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }
  await Promise.race([
    Promise.all(
      rows.map(async (r: any) => {
        const match = r.data;
        if (match) {
          // console.log(match);
          await insertMatch(match, {
            type: "api",
            origin: "scanner",
          });
        }
        await db.raw(
          "UPDATE insert_queue SET processed = TRUE WHERE match_seq_num = ?",
          [r.match_seq_num],
        );
      }),
    ),
    new Promise((resolve, reject) => {
      // Reject after 5 seconds
      setTimeout(() => reject(new Error("Request timed out")), 10000);
    }),
  ]);
}, 0);
