// Builds sets of data, e.g. tracked players in the background
import moment from 'moment';
import redis from '../store/redis.mjs';
import db from '../store/db.mjs';

export default async function buildSets(db, redis) {
  const docs = await db.select(['account_id'])
    .from('subscriber')
    .where('status', '=', 'active');
  const command = redis.multi();
  await command.del('tracked');
  // Refresh donators with expire date in the future
  await Promise.all(docs.map(player => command.zadd(
    'tracked',
    moment().add(1, 'day').format('X'),
    player.account_id
  )));
  return await command.exec();
}

while(true) {
  console.log('[BUILDSETS] rebuilding sets');
  const result = await buildSets(db, redis);
  console.log(result);
  await new Promise(resolve => setTimeout(resolve, 60 * 1000));
}

