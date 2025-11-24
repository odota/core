// Requests history refreshes for users to fill in missing matches and update privacy setting
import db from './store/db.ts';
import { addReliableJob } from './store/queue.ts';
import { runInLoop } from './util/utility.ts';

runInLoop(async function autoFh() {
  const { rows } = await db.raw(
    'SELECT account_id from players ORDER BY full_history_time ASC NULLS FIRST LIMIT 1',
  );
  console.log(rows);
  for (let row of rows) {
    await addReliableJob(
      {
        name: 'fhQueue',
        data: {
          account_id: row.account_id,
        },
      },
      {},
    );
  }
}, 1000);
