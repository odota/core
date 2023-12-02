import async from 'async';
import db from '../store/db.mjs';
import queries from '../store/queries.mjs';
import utility from '../util/utility.js';
const { invokeInterval, generateJob, getData } = utility;
function doProPlayers(cb) {
  const container = generateJob('api_notable', {});
  getData(container.url, (err, body) => {
    if (err) {
      return cb(err);
    }
    return async.each(
      body.player_infos,
      (p, cb) => {
        queries.upsert(
          db,
          'notable_players',
          p,
          {
            account_id: p.account_id,
          },
          cb
        );
      },
      cb
    );
  });
}
invokeInterval(doProPlayers, 30 * 60 * 1000);
