const queue = require('../store/queue');
const buildMatch = require('../store/buildMatch');
const db = require('../store/db');
const async = require('async');
const util = require('util');
const su = require('../util/scenariosUtil');

function processScenarios(matchID, cb) {
  console.log(matchID)
  buildMatch(matchID, (err, match) => {
    if (err) {
      cb(err);
    }
    su.scenarioChecks.forEach((scenarioCheck) => {
      const rows = scenarioCheck(match);
      console.log(rows)
      async.eachSeries(rows, (row, cb) => {
        const values = Object.keys(row.columns).map(() =>
          '?');
        const query = util.format(
          `INSERT INTO %s (%s) VALUES (%s) ON CONFLICT ON CONSTRAINT ${row.table}_constraint DO UPDATE SET wins = ${row.table}.wins + ${row.won ? 1 : 0}, games = ${row.table}.games + 1`,
          row.table,
          Object.keys(row.columns).join(','),
          values,
        );
        db.raw(query, Object.keys(row.columns).map(key =>
          row.columns[key])).asCallback(cb);
      });
    });
    cb();
  });
}

queue.runQueue('scenariosQueue', 1, processScenarios);
