// Updates Steam profile data for players periodically
import db from "./store/db.ts";
import { addReliableJob, runInLoop } from "./store/queue.ts";

await runInLoop(async function autoProfile() {
  // To optimize the api call we need to do 100 players at a time
  const { rows } = await db.query(
    "SELECT account_id from players ORDER BY profile_time ASC NULLS FIRST LIMIT 100",
  );
  console.log(rows);
  for (let row of rows) {
    await addReliableJob(
      {
        name: "profileQueue",
        data: { account_id: row.account_id },
      },
      { attempts: 1 },
    );
  }
}, 10000);
