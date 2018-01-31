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
    if (!su.validateMatchProperties) {
      console.log(`Skipping scenario checks for match ${matchID}. Invalid match object.`);
      cb();
    }
    Object.keys(su.scenarioChecks).forEach((table) => {
      su.scenarioChecks[table].forEach((scenarioCheck) => {
        const rows = scenarioCheck(match);
        async.eachSeries(rows, (row, cb) => {
          const values = Object.keys(row).map(() =>
            '?');
          const query = util.format(
            'INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET wins = %s.wins + EXCLUDED.wins, games = %s.games + 1',
            table,
            Object.keys(row).join(','),
            values,
            Object.keys(row).filter(column => column !== 'wins').join(','),
            table,
            table,
          );
          db.raw(query, Object.keys(row).map(key =>
            row[key])).asCallback(cb);
        });
      });
    });
    cb();
  });
}

queue.runQueue('scenariosQueue', 1, processScenarios);
