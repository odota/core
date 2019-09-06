const async = require('async');
const db = require('../store/db');
const config = require('../config');
const utility = require('../util/utility');

function clearScenariosTables() {
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
  ]);
}

setInterval(() => {
  clearScenariosTables();
}, 1000 * 60 * 60 * 1);
