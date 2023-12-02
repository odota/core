//NOT ENABLED: Updates the patch assigned to each pro match based on start_time
import constants from 'dotaconstants';
import db from '../store/db.mjs';
import queries from '../store/queries.mjs';
import utility from '../util/utility.mjs';

// No loop, just runs once when deployed
const matches = await db.select(['match_id', 'start_time']).from('matches');
// This could be a lot of matches so go one at a time
for (let i = 0; i < matches.length; i++) {
  const match = matches[i];
  await queries.upsertPromise(
    db,
    'match_patch',
    {
      match_id: match.match_id,
      patch:
        constants.patch[utility.getPatchIndex(match.start_time)].name,
    },
    {
      match_id: match.match_id,
    },
  );
}