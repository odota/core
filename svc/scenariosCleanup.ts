// Cleans up old data from the database (originally used for scenarios but now also does other cleanup)
import async from 'async';
import db from '../store/db';
import config from '../config.js';
import { epochWeek, invokeIntervalAsync } from '../util/utility';

async function scenariosCleanup() {
  const currentWeek = epochWeek();
  await async.parallel([
    (cb) => {
      db('team_scenarios')
        .whereNull('epoch_week')
        .orWhere(
          'epoch_week',
          '<=',
          currentWeek - config.MAXIMUM_AGE_SCENARIOS_ROWS
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
          currentWeek - config.MAXIMUM_AGE_SCENARIOS_ROWS
        )
        .del()
        .asCallback(cb);
    },
    (cb) => {
      db.raw(
        "DELETE from public_matches where start_time < extract(epoch from now() - interval '6 month')::int"
      ).asCallback(cb);
    },
    (cb) => {
      // db.raw('delete from match_gcdata where match_id not in (select match_id from matches) and match_id < (select max(match_id) - 50000000 from match_gcdata)').asCallback(cb);
    },
    (cb) => {
      db.raw(
        'delete from hero_search where match_id < (select max(match_id) - 150000000 from hero_search)'
      ).asCallback(cb);
    },
  ]);
  return;
}
invokeIntervalAsync(scenariosCleanup, 1000 * 60 * 60 * 6);
