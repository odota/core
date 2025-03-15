// Builds sets of data, e.g. tracked players in the background
import moment from 'moment';
import redis from '../store/redis';
import db from '../store/db';
import { invokeIntervalAsync } from '../util/utility';
import contributors from '../CONTRIBUTORS';
import config from '../config';

async function doBuildSets() {
  const subs = await db
    .select<{ account_id: string }[]>(['account_id'])
    .from('subscriber')
    .where('status', '=', 'active');
  const subIds = subs.map((sub) => sub.account_id);
  const contribs = Object.keys(contributors);
  const autos = config.AUTO_PARSE_ACCOUNT_IDS.split(',');
  console.log(
    '[BUILDSETS] %s subscribers, %s contributors, %s auto',
    subIds.length,
    contribs.length,
    autos.length,
  );
  const tracked: string[] = [...subIds, ...contribs, ...autos];
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
