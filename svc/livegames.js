import { eachSeries } from 'async';
import { parse } from 'json-bigint';
import { get } from 'request';
import { select } from '../store/db.js';
import utility from '../util/utility.js';
import { STEAM_API_KEY } from '../config.js';
import redis from '../store/redis.js';

const { invokeInterval } = utility;

function doLiveGames(cb) {
  // Get the list of pro players
  select()
    .from('notable_players')
    .asCallback((err, proPlayers) => {
      // Get the list of live games
      const apiKeys = STEAM_API_KEY.split(',');
      const liveGamesUrl = `https://api.steampowered.com/IDOTA2Match_570/GetTopLiveGame/v1/?key=${apiKeys[0]}&partner=0`;
      get(liveGamesUrl, (err, resp, body) => {
        if (err) {
          return cb(err);
        }
        const json = parse(body);
        // If a match contains a pro player
        // add their name to the match object, save it to redis zset, keyed by server_steam_id
        return eachSeries(
          json.game_list,
          (match, cb) => {
            // let addToRedis = false;
            if (match && match.players) {
              match.players.forEach((player, i) => {
                const proPlayer = proPlayers.find(
                  (proPlayer) =>
                    proPlayer.account_id.toString() ===
                    player.account_id.toString()
                );
                if (proPlayer) {
                  match.players[i] = { ...player, ...proPlayer };
                  // addToRedis = true;
                }
              });
              // convert the BigInt to a string
              match.lobby_id = match.lobby_id.toString();
              redis.zadd('liveGames', match.lobby_id, match.lobby_id);
              redis.setex(
                `liveGame:${match.lobby_id}`,
                28800,
                JSON.stringify(match)
              );
              // Keep only the 100 highest values
              redis.zremrangebyrank('liveGames', '0', '-101');
            }
            cb();
            // Get detailed stats for each live game
            // const { url } = utility.generateJob('api_realtime_stats', {
            //   server_steam_id: match.server_steam_id
            // }).url;
          },
          cb
        );
      });
    });
}
setInterval(doLiveGames, 60 * 1000);
