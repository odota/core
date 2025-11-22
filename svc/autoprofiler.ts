// Updates Steam profile data for players periodically
import db from './store/db.ts';
import { runInLoop } from './util/utility.ts';
import { addJob } from './store/queue.ts';

runInLoop(async function autoProfile() {
  // To optimize the api call we need to do 100 players at a time
  // We sample 100 random rows from the DB, with the downside that we might update a lot of inactive players
  // Alternatively we could also trigger updates from match insert to target active players
  // Or trigger update when refresh call is made
  const result = await db.raw(
    'SELECT account_id from players ORDER BY profile_time ASC LIMIT 100',
  );
  // Queue the rows
  await Promise.all(
    result.rows.map(async (row: any) => {
      await addJob({
        name: 'profileQueue',
        data: { account_id: row.account_id },
      });
    }),
  );
}, 10000);
