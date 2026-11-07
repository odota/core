// Processes a queue of requests to update MMR/rank medal for players
import { runQueue } from "./store/queue.ts";
import db from "./store/db.ts";
import config from "../config.ts";
import { redisCount } from "./store/redis.ts";
import { getRandomRetrieverUrl } from "./util/registry.ts";

await runQueue<MmrJob>(
  "mmrQueue",
  Number(config.MMR_PARALLELISM) || 1,
  1,
  async (batch: MmrJob[], i: number) => {
    const job = batch[0];
    const accountId = job.account_id;
    const url = await getRandomRetrieverUrl(`/profile/${accountId}`);
    console.log(url);
    let data: RetrieverPlayer | undefined = undefined;
    while (!data) {
      try {
        const resp = await fetch(url, {
          signal: AbortSignal.timeout(2000),
        });
        if (!resp.ok) {
          throw new Error(`Failed to fetch MMR data: ${resp.status}`);
        }
        data = await resp.json();
      } catch (e) {
        console.log("[MMR] Error fetching data for %s, retrying...", accountId);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    redisCount("retriever_player");

    // Update player's Dota Plus status if changed
    const plus = Boolean(data.is_plus_subscriber);
    await db.query(
      "UPDATE players SET plus = $1 WHERE account_id = $2 AND (plus != $3 OR plus IS NULL)",
      [plus, data.account_id, plus],
    );

    if (data.rank_tier) {
      // Insert into history if different from current value
      // NOTE: This is a read-then-insert and might insert twice if the same player is processed in parallel
      await db.query(
        "INSERT INTO rank_tier_history(account_id, time, rank_tier) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM rank_tier WHERE account_id = $4 AND rating = $5) ON CONFLICT DO NOTHING",
        [
          data.account_id,
          new Date(),
          data.rank_tier,
          data.account_id,
          data.rank_tier,
        ],
      );
      await db.query(
        "INSERT INTO rank_tier(account_id, rating) VALUES ($1, $2) ON CONFLICT(account_id) DO UPDATE SET rating = EXCLUDED.rating",
        [data.account_id, data.rank_tier],
      );
    }
    if (data.leaderboard_rank) {
      await db.query(
        "INSERT INTO leaderboard_rank(account_id, rating) VALUES ($1, $2) ON CONFLICT(account_id) DO UPDATE SET rating = EXCLUDED.rating",
        [data.account_id, data.leaderboard_rank],
      );
    }

    await db.query("UPDATE players SET rank_tier_time = $1 WHERE account_id = $2", [
      new Date(),
      job.account_id,
    ]);
  },
);
