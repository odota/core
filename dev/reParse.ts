// Issues reparse requests for all matches in postgres that aren't parsed
import db from '../store/db';
import { insertMatch } from '../store/queries';
import { getSteamAPIData, generateJob } from '../util/utility';

async function start() {
  const matches = await db.raw(
    'select match_id from matches where version IS NULL',
  );
  console.log(matches.rows.length);
  for (let i = 0; i < matches.rows.length; i++) {
    const input = matches.rows[i];
    // match id request, get data from API
    const body: any = await getSteamAPIData(
      generateJob('api_details', input).url,
    );
    // match details response
    const match = body.result;
    const job = await insertMatch(match, {
      type: 'api',
      attempts: 1,
      priority: 1,
      forceParse: true,
    });
  }
}
start();
