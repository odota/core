const db = require('../store/db');
const async = require('async');
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
  ]);
}

setInterval(() => {
<<<<<<< HEAD
  clearScenariosTables();
}, 1000 * 60 * 60 * 1);
=======
  async.eachSeries(tasks, (task, cb) => {
    task(cb);
  }, (err) => {
    if (err) {
      console.error(err);
    }
  });
}, 1000 * 60 * 60 * 8);
>>>>>>> e9ffb66832622ecdf88900eb826d0a5026f44430
