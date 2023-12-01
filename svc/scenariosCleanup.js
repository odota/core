import { parallel } from 'async';
import db, { raw } from '../store/db.js';
import { MAXIMUM_AGE_SCENARIOS_ROWS } from '../config.js';
import { epochWeek, invokeInterval } from '../util/utility.js';

function clearScenariosTables(cb) {
  const currentWeek = epochWeek();
  parallel(
    [
      (cb) => {
        db('team_scenarios')
          .whereNull('epoch_week')
          .orWhere(
            'epoch_week',
            '<=',
            currentWeek - MAXIMUM_AGE_SCENARIOS_ROWS
          )
          .del()
          .asCallback(cb);
      },
      (cb) => {
        db('scenarios')
          .whereNull('epoch_week')
          .orWhere(
            'epoch_week',
            '<=',
            currentWeek - MAXIMUM_AGE_SCENARIOS_ROWS
          )
          .del()
          .asCallback(cb);
      },
      (cb) => {
        raw(
          "DELETE from public_matches where start_time < extract(epoch from now() - interval '6 month')::int"
        ).asCallback(cb);
      },
      (cb) => {
        // db.raw('delete from match_gcdata where match_id not in (select match_id from matches) and match_id < (select max(match_id) - 50000000 from match_gcdata)').asCallback(cb);
      },
      (cb) => {
        raw(
          'delete from hero_search where match_id < (select max(match_id) - 150000000 from hero_search)'
        ).asCallback(cb);
      },
    ],
    cb
  );
}

invokeInterval(clearScenariosTables, 1000 * 60 * 60 * 6);
