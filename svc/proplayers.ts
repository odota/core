// Updates the list of pro players in the database
import axios from 'axios';
import db from '../store/db';
import { upsert } from '../store/queries';
import { invokeIntervalAsync } from '../util/utility';

async function doProPlayers() {
  const url = 'http://www.dota2.com/webapi/IDOTA2Fantasy/GetProPlayerInfo/v001';
  const resp = await axios.get(url);
  const apiPros = resp.data.player_infos;
  console.log('[PROPLAYERS]', apiPros.length, 'players');
  await Promise.all(
    apiPros.map((p: ProPlayer) =>
      upsert(db, 'notable_players', p, {
        account_id: p.account_id,
      }),
    ),
  );
}
invokeIntervalAsync(doProPlayers, 30 * 60 * 1000);
