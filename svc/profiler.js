/**
 * Worker to fetch updated player profiles
 * */
const async = require('async');
const queries = require('../store/queries');
const db = require('../store/db');
const utility = require('../util/utility');

const { insertPlayer, bulkIndexPlayer } = queries;
const { getData, generateJob, convert64to32 } = utility;

function getSummaries(cb) {
  db.raw('SELECT account_id from players TABLESAMPLE SYSTEM_ROWS(100)').asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    const container = generateJob('api_summaries', {
      players: result.rows,
    });
    return getData(container.url, (err, body) => {
      if (err) {
        // couldn't get data from api, non-retryable
        return cb(JSON.stringify(err));
      }

      const results = body.response.players.filter(player => player.steamid);

      const bulkUpdate = results.reduce((acc, player) => {
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

      bulkIndexPlayer(bulkUpdate, (err) => {
        if (err) {
          console.log(err);
        }
      });

      // player summaries response
      return async.each(results, (player, cb) => {
        insertPlayer(db, player, false, cb);
      }, cb);
    });
  });
}

function start() {
  getSummaries((err) => {
    if (err) {
      throw err;
    }
    return setTimeout(start, 1000);
  });
}

start();
