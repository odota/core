const async = require('async');
const db = require('../store/db');
const config = require('../config');
const utility = require('../util/utility');

function clearScenariosTables(cb) {
  const currentWeek = utility.epochWeek();
  async.parallel([
    (cb) => {
      db('team_scenarios').whereNull('epoch_week').orWhere('epoch_week', '<=', currentWeek - config.MAXIMUM_AGE_SCENARIOS_ROWS).del()
        .asCallback(cb);
    },
    (cb) => {
      db('scenarios').whereNull('epoch_week').orWhere('epoch_week', '<=', currentWeek - config.MAXIMUM_AGE_SCENARIOS_ROWS).del()
        .asCallback(cb);
    },
    (cb) => {
      db.raw('DELETE from public_matches where start_time < extract(epoch from now() - interval \'6 month\')::int').asCallback(cb);
    },
    (cb) => {
      db.raw('delete from match_gcdata where match_id not in (select match_id from matches) and match_id < (select max(match_id) - 50000000 from match_gcdata)').asCallback(cb);
    },
    (cb) => {
      db.raw('delete from hero_search where match_id < (select max(match_id) - 200000000 from hero_search)').asCallback(cb);
    },
  ], cb);
}

utility.invokeInterval(clearScenariosTables, 1000 * 60 * 60 * 1);
