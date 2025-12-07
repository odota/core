// Updates Steam profile data for players periodically
import db, { upsertPlayer } from './store/db.ts';
import { convert32to64, convert64to32, runInLoop } from './util/utility.ts';
import redis, { redisCount } from './store/redis.ts';
import { SteamAPIUrls, getSteamAPIDataWithRetry } from './util/http.ts';
import { getRandomRetrieverUrl } from './util/registry.ts';
import axios from 'axios';

runInLoop(async function profile() {
  const resp = await redis.lpop('profileQueue', 100);
  if (!resp || !resp.length) {
    return;
  }
  const jobs = resp.map((item) => JSON.parse(item) as ProfileJob);
  const url = SteamAPIUrls.api_summaries({
    players: jobs,
  });
  const body = await getSteamAPIDataWithRetry<ProfileSummaries>({ url });
  const results = body.response.players.filter((player) => player.steamid);
  const now = new Date();
  for (let player of results) {
    await upsertPlayer(db, { ...player, profile_time: now });
  }
  redisCount('profiler', resp.length);

  // Get aliases from retriever
  // This may fail but we'll just let it crash if we do
  const url2 = await getRandomRetrieverUrl(
    '/aliases/' +
      jobs.map((j) => convert32to64(String(j.account_id))).join(','),
  );
  const respAliases = await axios.get<RetrieverAliases>(url2);
  console.log('got %s alias results', Object.keys(respAliases.data).length);
  for (let steamid of Object.keys(respAliases.data)) {
    for (let item of respAliases.data[
      steamid as keyof typeof respAliases.data
    ]) {
      await db.raw(
        'INSERT INTO aliases(account_id, personaname, name_since) VALUES(?, ?, ?) ON CONFLICT(account_id, personaname) DO NOTHING',
        [convert64to32(steamid), item.name, new Date(item.name_since)],
      );
    }
  }
}, 2000);
