const async = require('async');
const db = require('../store/db');
const queries = require('../store/queries');
const utility = require('../util/utility');
const invokeInterval = utility.invokeInterval;

function doProPlayers(cb) {
  const container = utility.generateJob('api_notable', {});
  utility.getData(container.url, (err, body) => {
    if (err) {
      return cb(err);
    }
    return async.each(body.player_infos, (p, cb) => {
      if ((p.account_id === 180012313 || p.account_id === 323792491)
        && p.locked_until < 1502694000) {
        p.locked_until = 1502694000;
      }
      queries.upsert(db, 'notable_players', p, {
        account_id: p.account_id,
      }, cb);
    }, cb);
  });
}
invokeInterval(doProPlayers, 30 * 60 * 1000);
