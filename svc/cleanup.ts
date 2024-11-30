// Cleans up old data from the database (originally used for scenarios but now also does other cleanup)
import db from '../store/db';
import config from '../config';
import { epochWeek, invokeIntervalAsync } from '../util/utility';

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
  await db.raw(
    `DELETE from player_temp where writetime < extract(epoch from now() - interval '3 day')::int`,
  );
  return;
}
invokeIntervalAsync(cleanup, 1000 * 60 * 60 * 6);
