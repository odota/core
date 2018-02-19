const pm2 = require('pm2');
const db = require('../store/db');
const async = require('async');
const fs = require('fs');
const config = require('../config');
const redis = require('../store/redis');


function getStatus(process, cb) {
  pm2.describe(process, (err, description) => {
    status = Array.isArray(description) && description.length > 0 ? description[0].pm2_env.status : 'offline';
    cb(status);
  });
}

const tasks = [
  // clear the scenarios tables after a certain time
  function resetScenariosTables(cb) {
    console.log('a');
    redis.get('scenarios_reset_date', (err, reply) => {
      const today = new Date();
      if (!reply) {
        redis.set('scenarios_reset_date', today);
      }
      const scenarios_reset = reply || today;
      const dayDifference = Math.ceil(Math.abs(today.getTime() - new Date(scenarios_reset).getTime()) / (1000 * 3600 * 24));
      if (dayDifference >= config.SCENARIOS_TABLES_RESET_PERIOD) {
        async.parallel([
          (cb) => {
            db('team_scenarios').del().asCallback((err) => {
              if (err) {
                cb(err);
              } else {
                cb(null, 'team_scenarios');
              }
            });
          },
          (cb) => {
            db('scenarios').del().asCallback((err) => {
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
      }
      cb();
    });
  },
  // scenarios service should only for a certain amount of time after a reset
  function scheduleScenariosSvc(cb) {
    redis.get('scenarios_reset_date', (err, reply) => {
      console.log('b');
      const scenarios_reset = reply;
      const today = new Date();
      const dayDifference = Math.ceil(Math.abs(today.getTime() - new Date(scenarios_reset).getTime()) / (1000 * 3600 * 24));
      getStatus('scenarios', (status) => {
        console.log(status)
        console.log(dayDifference)
        if (dayDifference < config.SCENARIOS_SERVICE_UPTIME && status !== 'online') {
                    pm2.start('svc/scenarios.js', {
                        "group": "backend",
                        "exec_mode": "cluster",
                        "instances": 1
                    }, (err) => {
                        if (err) {
                            console.error('Error while starting scenarios service.');
                            cb(err);
                        }
                        console.log('Starting scenarios service.');
                        cb()
                    });
        } else {
            if (dayDifference >= config.SCENARIOS_SERVICE_UPTIME && status === 'online') {
                console.log("f")
              pm2.stop('scenarios', (err) => {
                if (err) {
                  console.error('Error while stopping scenarios service.');
                  cb(err);
                }
                console.log('Stopping scenarios service.');
                console.log("c")
              });
            }
            cb()
        }
      });
    });
  },
];


function start() {
    setTimeout(function () {
        async.eachSeries(tasks, (task, cb) => {
            task(cb);
        }, (err) => {
            if (err) {
                console.error(err);
            }
            start()
        })
    }, 3000);
}

start() 
