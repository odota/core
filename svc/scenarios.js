const queue = require('../store/queue');
const buildMatch = require('../store/buildMatch');
const db = require('../store/db');
const async = require('async');
const util = require('util');
const su = require('../util/scenariosUtil');

function processScenarios(matchID, cb) {
  buildMatch(matchID, (err, match) => {
    if (err) {
      cb(err);
    }
    su.scenarioChecks.forEach((scenarioCheck) => {
      const rows = scenarioCheck(match);
      async.eachSeries(rows, (row, cb) => {
        const values = Object.keys(row.columns).map(() =>
          '?');
        const query = util.format(
          'INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET wins = (%s).wins + EXCLUDED.wins, games = (%s).games + 1',
          row.table,
          Object.keys(row.columns).join(','),
          values,
          Object.keys(row.columns).slice(0, -1).join(','),
          row.table,
          row.table,
        );
        db.raw(query, Object.keys(row.columns).map(key =>
          row.columns[key])).asCallback(cb);
      });
    });
    cb();
  });
}

queue.runQueue('scenariosQueue', 1, processScenarios);
