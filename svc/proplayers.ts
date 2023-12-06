// Updates the list of pro players in the database
import db from '../store/db';
import { upsertPromise } from '../store/queries';
import { generateJob, getDataPromise } from '../util/utility';

async function start() {
  while (true) {
    console.time('doProPlayers');
    const container = generateJob('api_notable', {});
    const body = await getDataPromise(container.url);
    await Promise.all(
      body.player_infos.map((p: ProPlayer) =>
        upsertPromise(db, 'notable_players', p, {
          account_id: p.account_id,
        })
      )
    );
    console.timeEnd('doProPlayers');
    await new Promise((resolve) => setTimeout(resolve, 30 * 60 * 1000));
  }
}
start();
