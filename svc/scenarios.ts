// Processes a queue of jobs to collect stats on specific scenario data
import util from 'util';
import queue from '../store/queue';
import buildMatch from '../store/buildMatch';
import db from '../store/db';
import su from '../util/scenariosUtil';
import { epochWeek } from '../util/utility';

const { scenarioChecks } = su;
type ScenariosKey = keyof typeof scenarioChecks;

// Processors generally get back job objects but this one uses a string
async function processScenarios(matchID: string) {
  console.log('[SCENARIOS] match: %s', matchID);
  // NOTE: Using buildMatch is unnecessarily expensive here since it also looks up player names etc.
  const match = await buildMatch(Number(matchID), {});
  if (!match || !('version' in match)) {
    return;
  }
  if (!su.validateMatchProperties(match)) {
    console.error(
      `Skipping scenario checks for match ${matchID}. Invalid match object.`,
    );
    return;
  }
  const currentWeek = epochWeek();
  Object.keys(su.scenarioChecks).forEach((table) => {
    su.scenarioChecks[table as ScenariosKey].forEach(async (scenarioCheck) => {
      const rows = scenarioCheck(match);
      for (let i = 0; i < rows.length; i++) {
        let row = rows[i];
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
          table,
        );
        await db.raw(
          query,
          Object.keys(row).map((key) => row[key]),
        );
      }
    });
  });
}
queue.runQueue('scenariosQueue', 1, processScenarios);
