// Updates Steam profile data for players periodically
import db, { upsertPlayer } from './store/db.ts';
import {
  getSteamAPIDataWithRetry,
  SteamAPIUrls,
  runInLoop,
} from './util/utility.ts';
import redis, { redisCount } from './store/redis.ts';

runInLoop(async function profile() {
  const resp = await redis.lpop('profileQueue', 100);
  if (!resp || !resp.length) {
    return;
  }
  const jobs = resp.map((item) => JSON.parse(item) as ProfileJob);
  const url = SteamAPIUrls.api_summaries({
    players: jobs,
  });
  const body = await getSteamAPIDataWithRetry({ url });
  const results = body.response.players.filter(
    (player: User) => player.steamid,
  );
  const now = new Date();
  for (let player of results) {
    player.profile_time = now;
    await upsertPlayer(db, player);
  }
  redisCount('profiler', resp.length);
}, 2000);
