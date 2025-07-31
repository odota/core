// Issues reparse requests for all matches in postgres that aren't parsed
import db from '../svc/store/db';
import { addReliableJob } from '../svc/store/queue';

async function start() {
  const matches = await db.raw(
    'select match_id from matches where replay_salt IS NULL',
  );
  console.log(matches.rows.length);
  for (let i = 0; i < matches.rows.length; i++) {
    const input = matches.rows[i];
    // match id request, get data from API
    await addReliableJob(
      { name: 'parse', data: { match_id: input.match_id } },
      { priority: -3 },
    );
  }
}
start();
