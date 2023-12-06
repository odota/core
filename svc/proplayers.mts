// Updates the list of pro players in the database
import db from '../store/db.mts';
import { upsertPromise } from '../store/queries.mts';
import utility from '../util/utility.mjs';
const { generateJob, getDataPromise } = utility;

while (true) {
  console.time('doProPlayers');
  const container = generateJob('api_notable', {});
  //@ts-ignore
  const body = await getDataPromise(container.url);
  await Promise.all(
    body.player_infos.map((p: ProPlayer) =>
      //@ts-ignore
      upsertPromise(db, 'notable_players', p, {
        account_id: p.account_id,
      })
    )
  );
  console.timeEnd('doProPlayers');
  await new Promise((resolve) => setTimeout(resolve, 30 * 60 * 1000));
}
