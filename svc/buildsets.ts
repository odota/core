// Builds sets of data, e.g. tracked players in the background
import moment from 'moment';
import redis from './store/redis.ts';
import db from './store/db.ts';
import { invokeIntervalAsync } from './util/utility.ts';
import contributors from '../CONTRIBUTORS.ts';

async function doBuildSets() {
  const subs = await db
    .select<{ account_id: string }[]>(['account_id'])
    .from('subscriber')
    .where('status', '=', 'active');
  const subIds = subs.map((sub) => sub.account_id);
  const contribs = Object.keys(contributors);
  console.log(
    '[BUILDSETS] %s subscribers, %s contributors',
    subIds.length,
    contribs.length,
  );
  const tracked: string[] = [...subIds, ...contribs];
  const command = redis.multi();
  command.del('tracked');
  // Refresh tracked players with expire date in the future
  await Promise.all(
    tracked.map((id) =>
      command.zadd('tracked', moment.utc().add(1, 'day').format('X'), id),
    ),
  );
  await command.exec();
}
invokeIntervalAsync(doBuildSets, 60 * 1000);
