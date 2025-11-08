// Updates rank tier data for players periodically
import db from './store/db.ts';
import { runInLoop } from './util/utility.ts';
import { addJob } from './store/queue.ts';

runInLoop(async function autoMmr() {
  const { rows } = await db.raw(
    'SELECT account_id from players TABLESAMPLE SYSTEM_ROWS(1)',
  );
  const first = rows[0];
  if (first?.account_id) {
    await addJob({
      name: 'mmrQueue',
      data: { account_id: first.account_id },
    });
  }
}, 1000);
