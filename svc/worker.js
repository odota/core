/**
 * Worker running tasks on timed intervals
 **/
const config = require('../config');
const constants = require('dotaconstants');
const redis = require('../store/redis');
const queue = require('../store/queue');
const db = require('../store/db');
const queries = require('../store/queries');
const buildSets = require('../store/buildSets');
const utility = require('../util/utility');
// const getMMStats = require('../util/getMMStats');
const vdf = require('simple-vdf');
const async = require('async');
const fs = require('fs');
const moment = require('moment');

const sql = {};
const sqlq = fs.readdirSync('./sql');
sqlq.forEach((f) => {
  sql[f.split('.')[0]] = fs.readFileSync(`./sql/${f}`, 'utf8');
});

function invokeInterval(func, delay) {
  // invokes the function immediately, waits for callback, waits the delay, and then calls it again
  (function invoker() {
    redis.get(`worker:${func.name}`, (err, fresh) => {
      if (err) {
        return setTimeout(invoker, delay);
      }
      if (fresh && config.NODE_ENV !== 'development') {
        console.log('skipping %s', func.name);
        return setTimeout(invoker, delay);
      }
      console.log('running %s', func.name);
      console.time(func.name);
      return func((err) => {
        if (err) {
          // log the error, but wait until next interval to retry
          console.error(err);
        } else {
          // mark success, don't redo until this key expires
          redis.setex(`worker:${func.name}`, (delay / 1000) * 0.9, '1');
        }
        console.timeEnd(func.name);
        setTimeout(invoker, delay);
      });
    });
  }());
}

function doBuildSets(cb) {
  buildSets(db, redis, cb);
}
/*
function doMMStats(cb) {
  getMMStats(redis, cb);
}
*/
function doDistributions(cb) {
  function loadData(key, mapFunc, cb) {
    db.raw(sql[key]).asCallback((err, results) => {
      if (err) {
        return cb(err);
      }
      mapFunc(results);
      return cb(err, results);
    });
  }
  async.parallel({
    country_mmr(cb) {
      const mapFunc = function mapCountryMmr(results) {
        results.rows = results.rows.map((r) => {
          const ref = constants.countries[r.loccountrycode];
          r.common = ref ? ref.name.common : r.loccountrycode;
          return r;
        });
      };
      loadData('country_mmr', mapFunc, cb);
    },
    mmr(cb) {
      const mapFunc = function mapMmr(results) {
        const sum = results.rows.reduce((prev, current) =>
          ({
            count: prev.count + current.count,
          }), {
            count: 0,
          });
        results.rows = results.rows.map((r, i) => {
          r.cumulative_sum = results.rows.slice(0, i + 1).reduce((prev, current) =>
            ({
              count: prev.count + current.count,
            }), {
              count: 0,
            }).count;
          return r;
        });
        results.sum = sum;
      };
      loadData('mmr', mapFunc, cb);
    },
  }, (err, result) => {
    if (err) {
      return cb(err);
    }
    Object.keys(result).forEach((key) => {
      redis.set(`distribution:${key}`, JSON.stringify(result[key]));
    });
    return cb(err);
  });
}

function doQueueCleanup(cb) {
  queue.cleanup(redis, cb);
}

function doProPlayers(cb) {
  const container = utility.generateJob('api_notable', {});
  utility.getData(container.url, (err, body) => {
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

function doLeagues(cb) {
  const container = utility.generateJob('api_leagues', {
    language: 'english',
  });
  utility.getData(container.url, (err, apiLeagues) => {
    if (err) {
      return cb(err);
    }
    return utility.getData('https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/items/leagues.json', (err, leagues) => {
      if (err) {
        return cb(err);
      }
      return async.each(apiLeagues.result.leagues, (l, cb) => {
        if (leagues[l.leagueid]) {
          l.tier = leagues[l.leagueid].tier;
          l.ticket = leagues[l.leagueid].ticket;
          l.banner = leagues[l.leagueid].banner;
        }
        /*
        Excluded leagues (premium/professional)
        4177 - CDEC Master
        4649 - Manila Major Open Qualifiers
        4325 - Shanghai Open Qualifiers
        4768 - TI6 Open Qualifiers
        3990 - Frankfurt Open Qualifiers
        4181 - Dota 2 Canada Cup Season 6 Open Qualifiers
        5027 - Boston Major Open Qualifier
        */
        const excludedLeagues = [4177, 4649, 4325, 4768, 3990, 4181, 5027];
        if ((l.tier === 'professional' || l.tier === 'premium') &&
          !excludedLeagues.includes(Number(l.leagueid)) &&
          l.name.indexOf('Open Qualifier') === -1) {
          redis.sadd('pro_leagueids', l.leagueid);
        }
        queries.upsert(db, 'leagues', l, {
          leagueid: l.league_id,
        }, cb);
      }, cb);
    });
  });
}

function doTeams(cb) {
  db.raw('select distinct team_id from team_match').asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return async.eachSeries(result.rows, (m, cb) => {
      const container = utility.generateJob('api_teams', {
        // 2 is the smallest team id, use as default
        team_id: m.team_id || 2,
      });
      utility.getData(container.url, (err, body) => {
        if (err) {
          return cb(err);
        }
        if (!body.teams) {
          return cb();
        }
        const t = body.teams[0];
        return queries.upsert(db, 'teams', t, {
          team_id: t.team_id,
        }, cb);
      });
    }, cb);
  });
}

function doHeroes(cb) {
  const container = utility.generateJob('api_heroes', {
    language: 'english',
  });
  utility.getData(container.url, (err, body) => {
    if (err) {
      return cb(err);
    }
    if (!body || !body.result || !body.result.heroes) {
      return cb();
    }
    return async.eachSeries(body.result.heroes, (hero, cb) => {
      queries.upsert(db, 'heroes', hero, {
        id: hero.id,
      }, cb);
    }, cb);
  });
}

function doItems(cb) {
  const container = utility.generateJob('api_items', {
    language: 'english',
  });
  utility.getData(container.url, (err, body) => {
    if (err) {
      return cb(err);
    }
    if (!body || !body.result || !body.result.items) {
      return cb();
    }
    return async.eachSeries(body.result.items, (item, cb) => {
      queries.upsert(db, 'items', item, {
        id: item.id,
      }, cb);
    });
  });
}

function doCosmetics(cb) {
  utility.getData(utility.generateJob('api_item_schema').url, (err, body) => {
    if (err) {
      return cb(err);
    }
    // Get the item schema URL
    if (!body || !body.result || !body.result.items_game_url) {
      return cb();
    }
    return utility.getData(body.result.items_game_url, (err, body) => {
      if (err) {
        return cb(err);
      }
      const itemData = vdf.parse(body);
      console.log(Object.keys(itemData.items_game.items).length);
      return async.eachLimit(Object.keys(itemData.items_game.items), 5, (itemId, cb) => {
        const item = itemData.items_game.items[itemId];
        item.item_id = Number(itemId);
        const hero = item.used_by_heroes && typeof (item.used_by_heroes) === 'object' && Object.keys(item.used_by_heroes)[0];

        function insert(cb) {
          // console.log(item);
          return queries.upsert(db, 'cosmetics', item, {
            item_id: item.item_id,
          }, cb);
        }
        if (hero) {
          item.used_by_heroes = hero;
        }
        // console.log(item);
        if (!item.item_id) {
          return cb();
        }
        if (item.image_inventory) {
          const spl = item.image_inventory.split('/');
          const iconname = spl[spl.length - 1];
          return utility.getData({
            url: utility.generateJob('api_item_icon', {
              iconname,
            }).url,
            noRetry: true,
          }, (err, body) => {
            if (err || !body || !body.result) {
              return cb();
            }
            item.image_path = body.result.path;
            return insert(cb);
          });
        }
        return insert(cb);
      }, cb);
    });
  });
}

function doTelemetryCleanup(cb) {
  redis.zremrangebyscore('added_match', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('error_500', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('api_hits', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('parser', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('retriever', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('visitor_match', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('requests', 0, moment().subtract(1, 'day').format('X'));
  cb();
}

function doHeroStats(cb) {
  const now = moment();
  const minTime = now.startOf('month').format('X');
  const maxTime = now.endOf('month').format('X');
  async.parallel({
    publicHeroes(cb) {
      db.raw(`
              SELECT
              LEAST(GREATEST(avg_mmr / 1000 * 1000, 1000), 5000) as avg_mmr_bucket,
              sum(case when radiant_win = (player_slot < 128) then 1 else 0 end) as win, 
              count(*) as pick,
              hero_id 
              FROM public_player_matches 
              JOIN 
              (SELECT * FROM public_matches
              TABLESAMPLE SYSTEM_ROWS(1000000)
              WHERE start_time > ?
              AND start_time < ?
              ORDER BY match_id desc) 
              matches_list USING(match_id)
              WHERE hero_id > 0
              GROUP BY avg_mmr_bucket, hero_id
              ORDER BY hero_id
          `, [minTime, maxTime])
        .asCallback(cb);
    },
    proHeroes(cb) {
      db.raw(`
              SELECT 
              sum(case when radiant_win = (player_slot < 128) then 1 else 0 end) as pro_win, 
              count(*) as pro_pick,
              hero_id
              FROM player_matches
              JOIN matches USING(match_id)
              WHERE hero_id > 0
              AND start_time > ?
              AND start_time < ?
              GROUP BY hero_id
              ORDER BY hero_id
          `, [minTime, maxTime])
        .asCallback(cb);
    },
    proBans(cb) {
      db.raw(`
              SELECT 
              count(*) as pro_ban,
              hero_id
              FROM picks_bans
              JOIN matches USING(match_id)
              WHERE hero_id > 0
              AND start_time > ?
              AND start_time < ?
              AND is_pick IS FALSE
              GROUP BY hero_id
              ORDER BY hero_id
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
        objectResponse[row.hero_id] = Object.assign({}, objectResponse[row.hero_id],
          key === 'publicHeroes' ? {
            [`${row.avg_mmr_bucket}_pick`]: row.pick,
            [`${row.avg_mmr_bucket}_win`]: row.win,
          } : row);
      });
    });
    return redis.set(`heroStats:${minTime}`, JSON.stringify(Object.keys(objectResponse).map(key => objectResponse[key])), cb);
  });
}

invokeInterval(doBuildSets, 60 * 1000);
// invokeInterval(doMMStats, config.MMSTATS_DATA_INTERVAL * 60 * 1000); // Sample every 3 minutes
invokeInterval(doDistributions, 6 * 60 * 60 * 1000);
invokeInterval(doQueueCleanup, 60 * 60 * 1000);
invokeInterval(doProPlayers, 30 * 60 * 1000);
invokeInterval(doLeagues, 30 * 60 * 1000);
invokeInterval(doTeams, 60 * 60 * 1000);
invokeInterval(doHeroes, 60 * 60 * 1000);
invokeInterval(doItems, 60 * 60 * 1000);
invokeInterval(doCosmetics, 12 * 60 * 60 * 1000);
invokeInterval(doTelemetryCleanup, 3 * 60 * 1000);
invokeInterval(doHeroStats, 60 * 60 * 1000);
