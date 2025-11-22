// Updates Steam profile data for players periodically
import db from './store/db.ts';
import { runInLoop } from './util/utility.ts';
import { addJob } from './store/queue.ts';

runInLoop(async function autoProfile() {
  // To optimize the api call we need to do 100 players at a time
  const { rows } = await db.raw(
    'SELECT account_id from players ORDER BY profile_time ASC LIMIT 100',
  );
  console.log(rows);
  await Promise.all(
    rows.map(async (row: any) => {
      await addJob({
        name: 'profileQueue',
        data: { account_id: row.account_id },
      });
    }),
  );
}, 10000);
