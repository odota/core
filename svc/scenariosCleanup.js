const db = require('../store/db');
const async = require('async');
const config = require('../config');
const redis = require('../store/redis');


const tasks = [
  // clear the scenarios tables after a certain time
  function resetScenariosTables(cb) {
    redis.get('scenarios_reset_date', (err, reply) => {
      if (err) {
        cb(err);
      }
      const today = new Date();
      const scenariosReset = reply;
      const dayDifference = Math.ceil(Math.abs(today.getTime() - new Date(scenariosReset).getTime()) / (1000 * 3600 * 24));
      if (dayDifference >= config.SCENARIOS_TABLES_RESET_PERIOD) {
        async.parallel([
          (cb) => {
            db('team_scenarios').where('current', '!=', 'true').del().then(() => db('team_scenarios').update({
              current: 'false',
            }))
              .asCallback((err) => {
                if (err) {
                  cb(err);
                } else {
                  cb(null, 'team_scenarios');
                }
              });
          },
          (cb) => {
            db('scenarios').where('current', '!=', 'true').del().then(() => db('scenarios').update({
              current: 'false',
            }))
              .asCallback((err) => {
                if (err) {
                  cb(err);
                } else {
                  cb(null, 'scenarios');
                }
              });
          },
        ], (err, results) => {
          console.log(`Successfully cleared tables: ${results}`);
          if (err) {
            console.error(err.toString());
            cb(err);
          }
          redis.set('scenarios_reset_date', new Date());
          cb();
        });
      } else {
        cb();
      }
    });
  },
  // scenarios service should only for a certain amount of time after a reset
  function scheduleScenariosSvc(cb) {
    redis.get('scenarios_reset_date', (err, reply) => {
      if (err) {
        cb(err);
      }
      const scenariosReset = reply;
      const today = new Date();
      const dayDifference = Math.ceil(Math.abs(today.getTime() - new Date(scenariosReset).getTime()) / (1000 * 3600 * 24));
      redis.get('parse_scenarios', (err, reply) => {
        if (err) {
          cb(err);
        }
        if (parseInt(dayDifference, 10) + parseInt(config.SCENARIOS_SERVICE_UPTIME, 10) >= config.SCENARIOS_TABLES_RESET_PERIOD && reply === 'false') {
          redis.set('parse_scenarios', true);
          console.log('Starting scenarios parsing.');
          cb();
        } else {
          if (parseInt(dayDifference, 10) + parseInt(config.SCENARIOS_SERVICE_UPTIME, 10) < config.SCENARIOS_TABLES_RESET_PERIOD && reply === 'true') {
            redis.set('parse_scenarios', false);
            console.log('Stopping scenarios parsing.');
          }
          cb();
        }
      });
    });
  },
];

redis.get('scenarios_reset_date', (err, reply) => {
  if (err) {
    console.error(err);
  } else if (!reply) {
    redis.set('scenarios_reset_date', new Date());
  }
});

function start() {
  setTimeout(() => {
    async.eachSeries(tasks, (task, cb) => {
      task(cb);
    }, (err) => {
      if (err) {
        console.error(err);
      }
      start();
    });
  }, 1000 * 60 * 60 * 12);
}

start();
