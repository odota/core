// Refreshes the rank_tier_distribution materialized view periodically
import db from "./store/db.ts";
import { runInLoop } from "./store/queue.ts";

await runInLoop(
  async function distributions() {
    await db.query(
      "REFRESH MATERIALIZED VIEW CONCURRENTLY rank_tier_distribution",
    );
  },
  1 * 60 * 60 * 1000,
);
