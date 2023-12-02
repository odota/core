// Updates the patch assigned to each pro match based on start_time
// TODO use top level await
import async from 'async';
import constants from 'dotaconstants';
import db from '../store/db.mjs';
import queries from '../store/queries.mjs';
import utility from '../util/utility.mjs';
const { invokeInterval } = utility;
function rePatch() {
  db.select(['match_id', 'start_time'])
    .from('matches')
    .asCallback((err, matchIds) => {
      if (err) {
        throw err;
      }
      async.eachSeries(
        matchIds,
        (match, cb) => {
          queries.upsert(
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
            cb
          );
        },
        (err) => {
          console.error(err);
        }
      );
    });
}
invokeInterval(rePatch, 24 * 60 * 60 * 1000);
