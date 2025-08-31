// Randomly requests history refreshes for users to fill in missing matches and update privacy setting
import db from './store/db.ts';
import { addJob } from './store/queue.ts';
import { invokeIntervalAsync } from './util/utility.ts';

async function doAutoFullHistory() {
  const result = await db.raw(
    'SELECT account_id from players ORDER BY full_history_time ASC NULLS FIRST LIMIT 1',
  );
  console.log(result.rows);
  await Promise.all(
    result.rows.map((row: any) =>
      addJob({
        name: 'fhQueue',
        data: {
          account_id: row.account_id,
        },
      }),
    ),
  );
}
invokeIntervalAsync(doAutoFullHistory, 1000);
