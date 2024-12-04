// Randomly requests history refreshes for users to fill in missing matches and update privacy setting
import db from '../store/db';
import { addJob } from '../store/queue';
import { invokeIntervalAsync } from '../util/utility';

async function doAutoFullHistory() {
  const result = await db.raw(
    "SELECT account_id from players TABLESAMPLE SYSTEM_ROWS(100)",
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
invokeIntervalAsync(doAutoFullHistory, 60 * 1000);
