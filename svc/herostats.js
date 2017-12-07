const constants = require('dotaconstants');
const moment = require('moment');
const async = require('async');
const db = require('../store/db');
const redis = require('../store/redis');
const utility = require('../util/utility');

const invokeInterval = utility.invokeInterval;

function doHeroStats(cb) {
  const minTime = moment().subtract(30, 'day').format('X');
  const maxTime = moment().format('X');
  async.parallel({
    publicHeroes(cb) {
      db.raw(`
              SELECT
              floor(avg_rank_tier / 10) as rank_tier,
              sum(case when radiant_win = (player_slot < 128) then 1 else 0 end) as win, 
              count(*) as pick,
              hero_id 
              FROM public_player_matches 
              JOIN 
              (SELECT * FROM public_matches
              TABLESAMPLE SYSTEM_ROWS(10000000)
              WHERE start_time > ?
              AND start_time < ?
              AND avg_rank_tier IS NOT NULL)
              matches_list USING(match_id)
              WHERE hero_id > 0
              GROUP BY rank_tier, hero_id
              ORDER BY hero_id
          `, [minTime, maxTime])
        .asCallback(cb);
    },
    proHeroes(cb) {
      db.raw(`
              SELECT 
              sum(case when radiant_win = (player_slot < 128) then 1 else 0 end) as pro_win, 
              count(hero_id) as pro_pick,
              heroes.id as hero_id
              FROM heroes
              LEFT JOIN player_matches ON heroes.id = player_matches.hero_id
              LEFT JOIN matches on player_matches.match_id = matches.match_id
              WHERE start_time > ?
              AND start_time < ?
              GROUP BY heroes.id
              ORDER BY heroes.id
          `, [minTime, maxTime])
        .asCallback(cb);
    },
    proBans(cb) {
      db.raw(`
              SELECT 
              count(hero_id) as pro_ban,
              heroes.id as hero_id
              FROM heroes
              LEFT JOIN picks_bans ON heroes.id = picks_bans.hero_id AND is_pick IS FALSE
              LEFT JOIN matches on picks_bans.match_id = matches.match_id
              WHERE start_time > ?
              AND start_time < ?
              GROUP BY heroes.id
              ORDER BY heroes.id
          `, [minTime, maxTime])
        .asCallback(cb);
    },
  }, (err, result) => {
    if (err) {
      return cb(err);
    }
    // Build object keyed by hero_id for each result array
    const objectResponse = JSON.parse(JSON.stringify(constants.heroes));
    Object.keys(result).forEach((key) => {
      result[key].rows.forEach((row) => {
        objectResponse[row.hero_id] = Object.assign(
          {}, objectResponse[row.hero_id],
          key === 'publicHeroes' ? {
            [`${row.rank_tier}_pick`]: row.pick,
            [`${row.rank_tier}_win`]: row.win,
          } : row,
        );
      });
    });
    return redis.set('heroStats', JSON.stringify(Object.keys(objectResponse).map(key => objectResponse[key])), cb);
  });
}
invokeInterval(doHeroStats, 60 * 60 * 1000);
