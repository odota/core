// Cleans up old data from the database (originally used for scenarios but now also does other cleanup)
import db from '../store/db';
import config from '../config';
import { epochWeek, invokeIntervalAsync } from '../util/utility';
import { promises as fs } from 'fs';

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
    const stat = await fs.stat('./cache' + files[i]);
    if (stat.birthtime < new Date(Date.now() - 48 * 60 * 60 * 1000)) {
      await fs.unlink('./cache/' + files[i]);
    }
  }
  return;
}
invokeIntervalAsync(cleanup, 1000 * 60 * 60 * 6);
