// Randomly requests history refreshes for users to fill in missing matches and update privacy setting
import db from './store/db.ts';
import { addReliableJob } from './store/queue.ts';
import { runInLoop } from './util/utility.ts';

runInLoop(async function autoFh() {
  const result = await db.raw(
    'SELECT account_id from players ORDER BY full_history_time ASC NULLS FIRST LIMIT 1',
  );
  console.log(result.rows);
  await Promise.all(
    result.rows.map((row: any) =>
      addReliableJob({
        name: 'fhQueue',
        data: {
          account_id: row.account_id,
        },
      }, {}),
    ),
  );
}, 1000);
