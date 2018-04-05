const async = require('async');
const redis = require('../store/redis');
const db = require('../store/db');
const utility = require('../util/utility');

const invokeInterval = utility.invokeInterval;

function doLiveGames(cb) {
  // Get the list of pro players
  db.select().from('notable_players').asCallback((err, proPlayers) => {
    const liveGamesUrl = utility.generateJob('api_top_live_game').url;
    // Get the list of live games
    utility.getData(liveGamesUrl, (err, json) => {
      if (err) {
        return cb(err);
      }
      // If a match contains a pro player
      // add their name to the match object, save it to redis zset, keyed by server_steam_id
      return async.eachSeries(json.game_list, (match, cb) => {
        // let addToRedis = false;
        if (match && match.players) {
          match.players.forEach((player, i) => {
            const proPlayer = proPlayers.find(proPlayer =>
              proPlayer.account_id.toString() === player.account_id.toString());
            if (proPlayer) {
              match.players[i] = Object.assign({}, player, proPlayer);
              // addToRedis = true;
            }
          });
          redis.zadd('liveGames', match.lobby_id, match.lobby_id);
          redis.setex(`liveGame:${match.lobby_id}`, 28800, JSON.stringify(match));
          // Keep only the 100 highest values
          redis.zremrangebyrank('liveGames', '0', '-101');
        }
        cb();
        // Get detailed stats for each live game
        // const { url } = utility.generateJob('api_realtime_stats', {
        //   server_steam_id: match.server_steam_id
        // }).url;
      }, cb);
    });
  });
}
invokeInterval(doLiveGames, 60 * 1000);
