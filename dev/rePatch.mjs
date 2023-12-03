/**
 * Recalculate patch ID for matches in match table
 * */
import constants from 'dotaconstants';
import db from '../store/db.mjs';
import queries from '../store/queries.mjs';
import utility from '../util/utility.mjs';

db.select(['match_id', 'start_time'])
  .from('matches')
  .orderBy('match_id', 'desc')
  .asCallback((err, matchIds) => {
    if (err) {
      throw err;
    }
    matchIds.forEach((match) => {
      const patch =
        constants.patch[utility.getPatchIndex(match.start_time)].name;
      console.log(match.match_id, patch);
      queries.upsert(
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
