// Builds sets of data, e.g. tracked players in the background
import moment from 'moment';
import redis from '../store/redis.mjs';
import db from '../store/db.mjs';

export default async function buildSets() {
  const docs = await db
    .select(['account_id'])
    .from('subscriber')
    .where('status', '=', 'active');
  console.log('[BUILDSETS] %s tracked players', docs.length);
  const command = redis.multi();
  await command.del('tracked');
  // Refresh donators with expire date in the future
  await Promise.all(
    docs.map((player) =>
      command.zadd(
        'tracked',
        moment().add(1, 'day').format('X'),
        player.account_id
      )
    )
  );
  return await command.exec();
}

while (true) {
  console.log('[BUILDSETS] rebuilding sets');
  console.time('buildsets');
  await buildSets();
  console.timeEnd('buildsets');
  await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
}
