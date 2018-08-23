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
      // Corrections
      if (p.account_id === 116525052 && p.locked_until < 1535785200) {
        // Duster
        p.locked_until = 1535785200;
      }
      if (p.account_id === 87382579 && p.team_id === 39) {
        // Misery no longer on EG
        p.team_id = 0;
      }
      if (p.account_id === 88271237 && p.locked_until < 1535785200) {
        // Ceb
        p.locked_until = 1535785200;
      }
      if (p.account_id === 124936122 && p.locked_until < 1535785200) {	
        // Zyd
        p.locked_until = 1535785200;	
      }
      queries.upsert(db, 'notable_players', p, {
        account_id: p.account_id,
      }, cb);
    }, cb);
  });
}
invokeInterval(doProPlayers, 30 * 60 * 1000);
