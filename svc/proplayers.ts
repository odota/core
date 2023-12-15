// Updates the list of pro players in the database
import db from '../store/db';
import { upsert } from '../store/queries';
import {
  generateJob,
  getDataPromise,
  invokeIntervalAsync,
} from '../util/utility';

async function doProPlayers() {
  const container = generateJob('api_notable', {});
  const body = await getDataPromise(container.url);
  await Promise.all(
    body.player_infos.map((p: ProPlayer) =>
      upsert(db, 'notable_players', p, {
        account_id: p.account_id,
      })
    )
  );
}
invokeIntervalAsync(doProPlayers, 30 * 60 * 1000);
