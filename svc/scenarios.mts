// Processes a queue of jobs to collect stats on specific scenario data
import async from 'async';
import util from 'util';
import queue from '../store/queue.mts';
//@ts-ignore
import buildMatch from '../store/buildMatch.mts';
import db from '../store/db.mts';
import utility from '../util/utility.mjs';
import su from '../util/scenariosUtil.mjs';
async function processScenarios(matchID: string) {
  console.log('[SCENARIOS] match: %s', matchID);
  // Using buildMatch is unnecessarily expensive here since it also looks up player names etc.
  const match = await buildMatch(matchID);
  if (!su.validateMatchProperties(match)) {
    console.error(
      `Skipping scenario checks for match ${matchID}. Invalid match object.`
    );
    return;
  }
  const currentWeek = utility.epochWeek();
  Object.keys(su.scenarioChecks).forEach((table) => {
    //@ts-ignore
    su.scenarioChecks[table].forEach((scenarioCheck) => {
      const rows = scenarioCheck(match);
      async.eachSeries(rows, (row: any, cb: Function) => {
        row = Object.assign(row, {
          epoch_week: currentWeek,
          wins: row.wins ? '1' : '0',
        });
        const values = Object.keys(row).map(() => '?');
        const query = util.format(
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
        db.raw(
          query,
          Object.keys(row).map((key) => row[key])
        ).asCallback(cb);
      });
    });
  });
}
await queue.runQueue('scenariosQueue', 1, processScenarios);
