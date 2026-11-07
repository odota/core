// Updates Steam profile data for players periodically
import db, { upsertPlayer } from "./store/db.ts";
import { convert32to64, convert64to32 } from "./util/utility.ts";
import { redisCount } from "./store/redis.ts";
import { SteamAPIUrls, getSteamAPIDataWithRetry } from "./util/http.ts";
import { getRandomRetrieverUrl } from "./util/registry.ts";
import { runQueue } from "./store/queue.ts";

await runQueue<ProfileJob>("profileQueue", 1, 100, profile);

async function profile(batch: ProfileJob[]) {
  const steamids = batch.map((j) => convert32to64(String(j.account_id)));
  const url = SteamAPIUrls.api_summaries({
    steamids,
  });
  const body = await getSteamAPIDataWithRetry<ProfileSummaries>({ url });
  const results = body.response.players.filter((player) => player.steamid);
  const map = new Map<string, (typeof results)[number]>();
  const now = new Date();
  for (let player of results) {
    map.set(player.steamid, player);
  }
  for (let steamid of steamids) {
    // Some players may be missing if the player's profile is private
    // Update the profile_time anyway
    const player = map.get(steamid);
    await upsertPlayer(db, { ...player, steamid, profile_time: now });
  }
  redisCount("profiler", batch.length);

  // Get aliases from retriever
  // This may fail but we'll just let it crash if we do
  const url2 = await getRandomRetrieverUrl("/aliases/" + steamids.join(","));
  const resp = await fetch(url2, {
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch aliases: ${resp.status}`);
  }
  const aliasData: RetrieverAliases = await resp.json();
  console.log("got %s alias results", Object.keys(aliasData).length);
  for (let steamid of Object.keys(aliasData)) {
    const accountId = convert64to32(steamid);
    for (let item of aliasData[
      steamid as keyof typeof aliasData
    ]) {
      await db.query(
        "INSERT INTO aliases(account_id, personaname, name_since) VALUES($1, $2, $3) ON CONFLICT(account_id, personaname) DO NOTHING",
        [accountId, item.name, new Date(item.name_since)],
      );
    }
  }
  redisCount("alias");
}
