// Updates the list of currently live games
import JSONbig from 'json-bigint';
import redis from './store/redis.ts';
import db from './store/db.ts';
import { runInLoop } from './util/utility.ts';
import { getSteamAPIDataWithRetry, SteamAPIUrls } from './util/http.ts';

runInLoop(async function liveGames() {
  // Get the list of pro players
  const proPlayers: ProPlayer[] = await db.select().from('notable_players');
  // Get the list of live games
  const url = SteamAPIUrls.api_top_live_game({
    partner: Math.random() < 0.5 ? 1 : 2,
  });
  const body = await getSteamAPIDataWithRetry<string>({ url, raw: true });
  const json: TopLiveGames = JSONbig.parse(body);
  // If a match contains a pro player
  // add their name to the match object, save it to redis zset, keyed by server_steam_id
  for (let i = 0; i < json.game_list.length; i++) {
    const match = json.game_list[i];
    // let addToRedis = false;
    if (match && match.players) {
      match.players.forEach((player, i) => {
        const proPlayer = proPlayers.find(
          (proPlayer) =>
            proPlayer.account_id.toString() === player.account_id?.toString(),
        );
        if (proPlayer) {
          match.players[i] = { ...player, ...proPlayer };
          // addToRedis = true;
        }
      });
      // convert the BigInt to a string
      match.lobby_id = match.lobby_id.toString();
      await redis.zadd('liveGames', match.lobby_id, match.lobby_id);
      await redis.setex(
        `liveGame:${match.lobby_id}`,
        28800,
        JSON.stringify(match),
      );
      // Keep only the 100 highest values
      await redis.zremrangebyrank('liveGames', '0', '-101');
    }
    // Get detailed stats for each live game
    // const url = SteamAPIUrls.api_realtime_stats({
    //   server_steam_id: match.server_steam_id
    // });
  }
}, 60 * 1000);
