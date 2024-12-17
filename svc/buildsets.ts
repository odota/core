// Builds sets of data, e.g. tracked players in the background
import moment from 'moment';
import redis from '../store/redis';
import db from '../store/db';
import { invokeIntervalAsync } from '../util/utility';
import contributors from '../CONTRIBUTORS';
import config from '../config';

async function doBuildSets() {
  const subs = await db
    .select<{account_id: string}[]>(['account_id'])
    .from('subscriber')
    .where('status', '=', 'active');
  const contribs = Object.keys(contributors).map((id) => ({
    account_id: id,
  }));
  const autos = config.AUTO_PARSE_ACCOUNT_IDS.split(',').map(id => ({ account_id: id }));
  console.log(
    '[BUILDSETS] %s subscribers, %s contributors, %s auto',
    subs.length,
    contribs.length,
    autos.length,
    );
  const tracked: { account_id: string }[] = [...subs, ...contribs, ...autos];
  const command = redis.multi();
  command.del('tracked');
  // Refresh tracked players with expire date in the future
  await Promise.all(
    tracked.map((player) =>
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
