// Updates Steam profile data for players periodically
import { insertPlayerPromise, bulkIndexPlayer } from '../store/queries.mts';
import db from '../store/db.mts';
import { getDataPromise, generateJob, convert64to32 } from '../util/utility.mts';

while (true) {
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
    results.map((player: User) => insertPlayerPromise(db, player, false))
  );
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
