// Updates Steam profile data for players periodically
import { upsertPlayer, bulkIndexPlayer } from '../store/queries';
import db from '../store/db';
import {
  getDataPromise,
  generateJob,
  convert64to32,
  invokeIntervalAsync,
} from '../util/utility';

async function doProfiler() {
  // To optimize the api call we need to do 100 players at a time
  // We sample 100 random rows from the DB, with the downside that we might update a lot of inactive players
  // Alternatively we could also trigger updates from match insert to target active players
  const result = await db.raw(
    'SELECT account_id from players TABLESAMPLE SYSTEM_ROWS(100)'
  );
  const container = generateJob('api_summaries', {
    players: result.rows,
  });
  // We can also queue a rank tier/MMR request for these players
  const body = await getDataPromise(container.url);
  const results = body.response.players.filter(
    (player: User) => player.steamid
  );
  const bulkUpdate = results.reduce((acc: any, player: User) => {
    acc.push(
      {
        update: {
          _id: Number(convert64to32(player.steamid)),
        },
      },
      {
        doc: {
          personaname: player.personaname,
          avatarfull: player.avatarfull,
        },
        doc_as_upsert: true,
      }
    );
    return acc;
  }, []);
  await bulkIndexPlayer(bulkUpdate);
  await Promise.all(
    results.map((player: User) => upsertPlayer(db, player, false))
  );
}
invokeIntervalAsync(doProfiler, 5000);
