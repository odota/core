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
      if ((p.account_id === 180012313 || p.account_id === 323792491)
        && p.locked_until < 1502694000) {
        p.locked_until = 1502694000;
      }
      if (p.account_id === 87382579 && p.team_id === 39) {
        // Misery no longer on EG
        p.team_id = 0;
      }
      if (p.account_id === 88271237) {
        p.name = "7ckngMad";
      }
      if (p.account_id === 311360822 && p.team_id === 5216274) {
        // Ana is now on OG
        p.team_id = 2586976;
      }
      if (p.account_id === 94054712 && p.team_id === 5154470) {
        // Topson is now on OG
        p.team_id = 2586976;
      }
      if (p.account_id === 124936122 && p.team_id === 2643401) {
        // Zyd now on Team Serenity
        p.team_id = 5021898;
      }
      queries.upsert(db, 'notable_players', p, {
        account_id: p.account_id,
      }, cb);
    }, cb);
  });
}
invokeInterval(doProPlayers, 30 * 60 * 1000);
