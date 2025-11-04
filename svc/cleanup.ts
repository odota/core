// Cleans up old data from the database (originally used for scenarios but now also does other cleanup)
import db from './store/db.ts';
import config from '../config.ts';
import { epochWeek, runInLoop } from './util/utility.ts';
import fs from 'node:fs/promises';
import { isRecentVisitor, isRecentlyVisited } from './util/queries.ts';

runInLoop(
  async function cleanup() {
    const currentWeek = epochWeek();
    await db('team_scenarios')
      .whereNull('epoch_week')
      .orWhere(
        'epoch_week',
        '<=',
        currentWeek - Number(config.MAXIMUM_AGE_SCENARIOS_ROWS),
      )
      .del();
    await db('scenarios')
      .whereNull('epoch_week')
      .orWhere(
        'epoch_week',
        '<=',
        currentWeek - Number(config.MAXIMUM_AGE_SCENARIOS_ROWS),
      )
      .del();
    await db.raw(
      "DELETE from public_matches where start_time < extract(epoch from now() - interval '12 month')::int",
    );
    await db.raw(
      'DELETE from hero_search where match_id < (select max(match_id) - 200000000 from hero_search)',
    );
    let files: string[] = [];
    try {
      files = await fs.readdir('./cache');
    } catch (e) {
      // ignore if doesn't exist
    }
    for (let i = 0; i < files.length; i++) {
      try {
        // Check if the ID is of a recent visitor or recently visited profile, if so, don't delete
        const isVisitor = await isRecentVisitor(Number(files[i]));
        const isVisited = await isRecentlyVisited(Number(files[i]));
        if (!isVisited && !isVisitor) {
          await fs.unlink('./cache/' + files[i]);
        }
      } catch (e) {
        console.log(e);
      }
    }
    return;
  },
  1000 * 60 * 60 * 6,
);
