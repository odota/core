// Builds sets of data, e.g. tracked players in the background
import moment from 'moment';
import redis from '../store/redis';
import db from '../store/db';
import { invokeIntervalAsync } from '../util/utility';

async function doBuildSets() {
  const docs = await db
    .select(['account_id'])
    .from('subscriber')
    .where('status', '=', 'active');
  console.log('[BUILDSETS] %s tracked players', docs.length);
  const command = redis.multi();
  command.del('tracked');
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
  await command.exec();
}
invokeIntervalAsync(doBuildSets, 60 * 1000);
