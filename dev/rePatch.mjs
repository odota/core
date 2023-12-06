/**
 * Recalculate patch ID for matches in match table
 * */
import constants from 'dotaconstants';
import db from '../store/db.mts';
import { upsertPromise } from '../store/queries.mts';

db.select(['match_id', 'start_time'])
  .from('matches')
  .orderBy('match_id', 'desc')
  .asCallback((err, matchIds) => {
    if (err) {
      throw err;
    }
    matchIds.forEach(async (match) => {
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
    });
  });
