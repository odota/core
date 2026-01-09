// Requests history refreshes for users to fill in missing matches and update privacy setting
import db from "./store/db.ts";
import { addReliableJob, runInLoop } from "./store/queue.ts";

await runInLoop(async function autoFh() {
  const { rows } = await db.raw(
    "SELECT account_id from players ORDER BY full_history_time ASC NULLS FIRST LIMIT 20",
  );
  console.log(rows);
  for (let row of rows) {
    await addReliableJob(
      {
        name: "fhQueue",
        data: {
          account_id: row.account_id,
        },
      },
      {},
    );
  }
  // Fullhistory jobs can take ~5 seconds so only add new items slower than this to give queue time to drain
}, 5000);
