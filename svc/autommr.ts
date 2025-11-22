// Updates rank tier data for players periodically
import db from './store/db.ts';
import { runInLoop } from './util/utility.ts';
import { addJob } from './store/queue.ts';

runInLoop(async function autoMmr() {
  const { rows } = await db.raw(
    'SELECT account_id from players ORDER BY rank_tier_time ASC NULLS FIRST LIMIT 50',
  );
  console.log(rows);
  for (let row of rows) {
    await addJob({
      name: 'mmrQueue',
      data: { account_id: row.account_id },
    });
  }
}, 5000);
