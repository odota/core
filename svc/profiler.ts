// Updates Steam profile data for players periodically
import { upsertPlayer, bulkIndexPlayer } from './util/insert';
import db from './store/db';
import {
  getSteamAPIData,
  SteamAPIUrls,
  convert64to32,
  invokeIntervalAsync,
  redisCount,
} from './util/utility';
import redis from './store/redis';

async function doProfile() {
  const resp = await redis.lpop('profileQueue', 100);
  if (!resp || !resp.length) {
    return;
  }
  redisCount('profiler', resp.length);
  const jobs = resp.map((item) => JSON.parse(item) as ProfileJob);
  const url = SteamAPIUrls.api_summaries({
    players: jobs,
  });
  const body = await getSteamAPIData({ url });
  const results = body.response.players.filter(
    (player: User) => player.steamid,
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
      },
    );
    return acc;
  }, []);
  await bulkIndexPlayer(bulkUpdate);
  await Promise.all(
    results.map((player: User) => upsertPlayer(db, player, false)),
  );
}
invokeIntervalAsync(doProfile, 2000);
