import { eachSeries } from 'async';
import { format } from 'util';
import { runQueue } from '../store/queue.js';
import buildMatch from '../store/buildMatch.js';
import { raw } from '../store/db.js';
import { epochWeek } from '../util/utility.js';
import { validateMatchProperties, scenarioChecks } from '../util/scenariosUtil.js';

async function processScenarios(matchID, cb) {
  try {
    const match = await buildMatch(matchID);
    if (!validateMatchProperties(match)) {
      console.error(
        `Skipping scenario checks for match ${matchID}. Invalid match object.`
      );
      return cb();
    }
    const currentWeek = epochWeek();
    Object.keys(scenarioChecks).forEach((table) => {
      scenarioChecks[table].forEach((scenarioCheck) => {
        const rows = scenarioCheck(match);
        eachSeries(rows, (row, cb) => {
          row = Object.assign(row, {
            epoch_week: currentWeek,
            wins: row.wins ? '1' : '0',
          });
          const values = Object.keys(row).map(() => '?');
          const query = format(
            'INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET wins = %s.wins + EXCLUDED.wins, games = %s.games + 1',
            table,
            Object.keys(row).join(','),
            values.join(','),
            Object.keys(row)
              .filter((column) => column !== 'wins')
              .join(','),
            table,
            table
          );
          raw(
            query,
            Object.keys(row).map((key) => row[key])
          ).asCallback(cb);
        });
      });
    });
    return cb();
  } catch (err) {
    return cb(err);
  }
}

runQueue('scenariosQueue', 1, processScenarios);
