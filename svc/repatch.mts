//NOT ENABLED: Updates the patch assigned to each pro match based on start_time
import constants from 'dotaconstants';
import db from '../store/db.mts';
import { upsertPromise } from '../store/queries.mts';
import { getPatchIndex } from '../util/utility.mts';

// No loop, just runs once when deployed
const matches = await db.select(['match_id', 'start_time']).from('matches');
// This could be a lot of matches so go one at a time
for (let i = 0; i < matches.length; i++) {
  const match = matches[i];
  await upsertPromise(
    db,
    'match_patch',
    {
      match_id: match.match_id,
      patch: constants.patch[getPatchIndex(match.start_time)].name,
    },
    {
      match_id: match.match_id,
    }
  );
}
