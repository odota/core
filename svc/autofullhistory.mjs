// Randomly requests history refreshes for users to fill in missing matches
import db from '../store/db.mjs';
import queue from '../store/queue.mjs';

while (true) {
  const result = await db.raw(
    "SELECT account_id from players TABLESAMPLE SYSTEM_ROWS(100) where last_match_time > (now() - interval '7 day')"
  );
  console.log(result.rows);
  await Promise.all(
    result.rows.map((row) =>
      queue.addJob(
        'fhQueue',
        JSON.stringify({
          account_id: row.account_id,
          short_history: true,
        })
      )
    )
  );
  await new Promise((resolve) => setTimeout(resolve, 30000));
}
