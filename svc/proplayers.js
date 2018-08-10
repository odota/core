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
        // Duster's locked until value is incorrect
        p.locked_until = 1535785200;
      }
      if (p.account_id === 87382579 && p.team_id === 39) {
        // Misery no longer on EG
        p.team_id = 0;
      }
      if (p.account_id === 88271237 && p.locked_until < 1535785200) {
        p.name = '7ckngMad';
        p.locked_until = 1535785200;
      }
      if (p.account_id === 311360822 && p.team_id === 5216274) {
        // Ana is now on OG
        p.team_id = 2586976;
        p.locked_until = 1535785200;
      }
      if (p.account_id === 94054712 && p.team_id === 5154470) {
        // Topson is now on OG
        p.team_id = 2586976;
        p.locked_until = 1535785200;
      }
      if (p.account_id === 124936122) {
        // Zyd now on Team Serenity
        p.team_id = 5066616;
        p.locked_until = 1535785200;
      }
      if (p.account_id === 94155156) {
        // Fly now on EG
        p.team_id = 39;
        p.locked_until = 1535785200;
      }
      if (p.account_id === 41231571) {
        // s4 now on EG
        p.team_id = 39;
        p.locked_until = 1535785200;
      }
      if (p.account_id === 86725175) {
        // Reso now on VGJ.Storm
        p.team_id = 5228654;
        p.locked_until = 1535785200;
      }
      queries.upsert(db, 'notable_players', p, {
        account_id: p.account_id,
      }, cb);
    }, cb);
  });
}
invokeInterval(doProPlayers, 30 * 60 * 1000);
