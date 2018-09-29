const async = require('async');
const db = require('../store/db');
const queries = require('../store/queries');
const utility = require('../util/utility');

const { invokeInterval, generateJob, getData } = utility;

function doProPlayers(cb) {
  const container = generateJob('api_notable', {});
  getData(container.url, (err, body) => {
    if (err) {
      return cb(err);
    }
    return async.each(body.player_infos, (p, cb) => {
      queries.upsert(db, 'notable_players', p, {
        account_id: p.account_id,
      }, cb);
    }, cb);
  });
}
invokeInterval(doProPlayers, 30 * 60 * 1000);
