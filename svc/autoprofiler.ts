// Updates Steam profile data for players periodically
import db from './store/db.ts';
import { invokeIntervalAsync } from './util/utility.ts';
import { addJob } from './store/queue.ts';

async function doProfiler() {
  // To optimize the api call we need to do 100 players at a time
  // We sample 100 random rows from the DB, with the downside that we might update a lot of inactive players
  // Alternatively we could also trigger updates from match insert to target active players
  // Or trigger update when refresh call is made
  const result = await db.raw(
    'SELECT account_id from players TABLESAMPLE SYSTEM_ROWS(100)',
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
}
invokeIntervalAsync(doProfiler, 10000);
