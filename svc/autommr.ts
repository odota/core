// Updates rank tier data for players periodically
import db from './store/db.ts';
import { runInLoop } from './util/utility.ts';
import { addJob } from './store/queue.ts';

runInLoop(async function autoMmr() {
  const { rows } = await db.raw(
    'SELECT account_id from players ORDER BY rank_tier_time ASC NULLS FIRST LIMIT 20',
  );
  console.log(rows);
  await Promise.all(rows.map(async (row: any) => {
    await addJob({
      name: 'mmrQueue',
      data: { account_id: row.account_id },
    });
  }));
}, 10000);
