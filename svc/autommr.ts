// Updates rank tier data for players periodically
import db from "./store/db.ts";
import { addJob, runInLoop } from "./store/queue.ts";

await runInLoop(async function autoMmr() {
  const { rows } = await db.raw(
    "SELECT account_id from players ORDER BY rank_tier_time ASC NULLS FIRST LIMIT 25",
  );
  console.log(rows);
  for (let row of rows) {
    await addJob({
      name: "mmrQueue",
      data: { account_id: row.account_id },
    });
  }
}, 5000);
