// Randomly requests history refreshes for users to fill in missing matches
import db from '../store/db';
import queue from '../store/queue';

async function start() {
  while (true) {
    console.time('autofullhistory');
    const result = await db.raw(
      "SELECT account_id from players TABLESAMPLE SYSTEM_ROWS(100) where last_match_time > (now() - interval '7 day')"
    );
    console.log(result.rows);
    await Promise.all(
      result.rows.map((row: any) =>
        queue.addJob({
          name: 'fhQueue',
          data: {
            account_id: row.account_id,
            short_history: true,
          },
        })
      )
    );
    console.timeEnd('autofullhistory');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
}
start();
