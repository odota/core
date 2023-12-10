/**
 * Recalculate patch ID for matches in match table
 * */
import constants from 'dotaconstants';
import db from '../store/db';
import { upsertPromise } from '../store/queries';
import { getPatchIndex } from '../util/utility';

const matchIds = await db
  .select(['match_id', 'start_time'])
  .from('matches')
  .orderBy('match_id', 'desc');
for (let i = 0; i < matchIds.length; i++) {
  const match = matchIds[i];
  const patch = constants.patch[getPatchIndex(match.start_time)].name;
  console.log(match.match_id, patch);
  await upsertPromise(
    db,
    'match_patch',
    {
      match_id: match.match_id,
      patch,
    },
    {
      match_id: match.match_id,
    }
  );
}
