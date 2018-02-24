const db = require('../store/db');
const async = require('async');
const config = require('../config');


const tasks = [
  function clearScenariosTables(cb) {
    const currentWeek = Math.floor(new Date() / (1000 * 60 * 60 * 24 * 7));
    async.parallel([
      (cb) => {
        db('team_scenarios').where('epoch_week', '<=', currentWeek - config.MAXIMUM_AGE_SCENARIOS_ROWS).del()
          .asCallback((err) => {
            if (err) {
              cb(err);
            } else {
              cb();
            }
          });
      },
      (cb) => {
        db('scenarios').where('epoch_week', '<=', currentWeek - config.MAXIMUM_AGE_SCENARIOS_ROWS).del()
          .asCallback((err) => {
            if (err) {
              cb(err);
            } else {
              cb();
            }
          });
      },
    ], (err) => {
      if (err) {
        cb(err);
      }
      cb();
    });
  },
];

setInterval(() => {
  async.eachSeries(tasks, (task, cb) => {
    task(cb);
  }, (err) => {
    if (err) {
      console.error(err);
    }
  });
}, 1000 * 60 * 60 * 1);
