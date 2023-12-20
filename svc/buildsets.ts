// Builds sets of data, e.g. tracked players in the background
import moment from 'moment';
import redis from '../store/redis';
import db from '../store/db';
import { invokeIntervalAsync } from '../util/utility';
import contributors from '../CONTRIBUTORS';

async function doBuildSets() {
  const docs = await db
    .select(['account_id'])
    .from('subscriber')
    .where('status', '=', 'active');
  const contribs = Object.keys(contributors).map((id) => ({
    account_id: id,
  }));
  console.log(
    '[BUILDSETS] %s subscribers, %s contributors',
    docs.length,
    contribs.length,
  );
  const command = redis.multi();
  command.del('tracked');
  // Refresh donators and contribs with expire date in the future
  await Promise.all(
    [...docs, ...contribs].map((player) =>
      command.zadd(
        'tracked',
        moment().add(1, 'day').format('X'),
        player.account_id,
      ),
    ),
  );
  await command.exec();
}
invokeIntervalAsync(doBuildSets, 60 * 1000);
