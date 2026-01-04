// Updates Steam profile data for players periodically
import db, { upsertPlayer } from "./store/db.ts";
import { convert32to64, convert64to32 } from "./util/utility.ts";
import { redisCount } from "./store/redis.ts";
import { SteamAPIUrls, getSteamAPIDataWithRetry } from "./util/http.ts";
import { getRandomRetrieverUrl } from "./util/registry.ts";
import axios from "axios";
import { runQueue } from "./store/queue.ts";

await runQueue<ProfileJob>("profileQueue", 1, 100, profile);

async function profile(batch: ProfileJob[]) {
  const steamids = batch.map((j) => convert32to64(String(j.account_id)));
  const url = SteamAPIUrls.api_summaries({
    steamids,
  });
  const body = await getSteamAPIDataWithRetry<ProfileSummaries>({ url });
  const results = body.response.players.filter((player) => player.steamid);
  const now = new Date();
  for (let player of results) {
    await upsertPlayer(db, { ...player, profile_time: now });
  }
  redisCount("profiler", batch.length);

  // Get aliases from retriever
  // This may fail but we'll just let it crash if we do
  const url2 = await getRandomRetrieverUrl("/aliases/" + steamids.join(","));
  const respAliases = await axios.get<RetrieverAliases>(url2, {
    timeout: 5000,
  });
  console.log("got %s alias results", Object.keys(respAliases.data).length);
  for (let steamid of Object.keys(respAliases.data)) {
    const accountId = convert64to32(steamid);
    for (let item of respAliases.data[
      steamid as keyof typeof respAliases.data
    ]) {
      await db.raw(
        "INSERT INTO aliases(account_id, personaname, name_since) VALUES(?, ?, ?) ON CONFLICT(account_id, personaname) DO NOTHING",
        [accountId, item.name, new Date(item.name_since)],
      );
    }
  }
  redisCount("alias");
}
