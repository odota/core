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
const getMMStats = require('../util/getMMStats');
const vdf = require('simple-vdf');
const async = require('async');
const moment = require('moment');
const fs = require('fs');
const sql = {};
const sqlq = fs.readdirSync('./sql');
sqlq.forEach((f) => {
  sql[f.split('.')[0]] = fs.readFileSync('./sql/' + f, 'utf8');
});
console.log('[WORKER] starting worker');
invokeInterval((cb) => {
  utility.getData('https://pvgna.com/yasp', (err, guides) => {
    if (err)
            {
      console.log('Received a bad response from pvgna');
      return cb(err);
    }
    redis.set('pvgna', JSON.stringify(guides), cb);
  });
}, 60 * 60 * 1000 * 24); // Once every day
invokeInterval((cb) => {
  buildSets(db, redis, cb);
}, 60 * 1000);
invokeInterval((cb) => {
  getMMStats(redis, cb);
}, config.MMSTATS_DATA_INTERVAL * 60 * 1000); // Sample every 3 minutes
invokeInterval((cb) => {
  async.parallel(
    {
      'country_mmr': function (cb)
        {
        const mapFunc = function (results)
            {
          results.rows = results.rows.map((r) => {
            const ref = constants.countries[r.loccountrycode];
            r.common = ref ? ref.name.common : r.loccountrycode;
            return r;
          });
        };
        loadData('country_mmr', mapFunc, cb);
      },
      'mmr': function (cb)
        {
        const mapFunc = function (results)
            {
          const sum = results.rows.reduce((prev, current) => {
            return {
              count: prev.count + current.count,
            };
          },
            {
              count: 0,
            });
          results.rows = results.rows.map((r, i) => {
            r.cumulative_sum = results.rows.slice(0, i + 1).reduce((prev, current) => {
              return {
                count: prev.count + current.count,
              };
            },
              {
                count: 0,
              }).count;
            return r;
          });
          results.sum = sum;
        };
        loadData('mmr', mapFunc, cb);
      },
    }, (err, result) => {
    if (err)
        {
      return cb(err);
    }
    for (const key in result)
        {
      redis.set('distribution:' + key, JSON.stringify(result[key]));
    }
    cb(err);
  });

  function loadData(key, mapFunc, cb)
    {
    db.raw(sql[key]).asCallback((err, results) => {
      if (err)
            {
        return cb(err);
      }
      mapFunc(results);
      return cb(err, results);
    });
  }
}, 60 * 60 * 1000 * 6);
invokeInterval((cb) => {
  queue.cleanup(redis, cb);
}, 60 * 60 * 1000);
invokeInterval((cb) => {
  const container = utility.generateJob('api_notable',
    {});
  utility.getData(container.url, (err, body) => {
    if (err)
        {
      return cb(err);
    }
    async.each(body.player_infos, (p, cb) => {
      queries.upsert(db, 'notable_players', p,
        {
          account_id: p.account_id,
        }, cb);
    }, cb);
  });
}, 30 * 60 * 1000);
invokeInterval((cb) => {
  const container = utility.generateJob('api_leagues',
    {});
  utility.getData(container.url, (err, api_leagues) => {
    if (err)
        {
      return cb(err);
    }
    utility.getData('https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/items/leagues.json', (err, leagues) => {
      if (err)
            {
        return cb(err);
      }
      async.each(api_leagues.result.leagues, (l, cb) => {
        if (leagues[l.leagueid])
                {
          l.tier = leagues[l.leagueid].tier;
          l.ticket = leagues[l.leagueid].ticket;
          l.banner = leagues[l.leagueid].banner;
        }
        l.name = l.name.substring('#DOTA_Item_'.length).split('_').join(' ');
        if (l.tier === 'professional' || l.tier === 'premium')
                {
          redis.sadd('pro_leagueids', l.leagueid);
        }
        queries.upsert(db, 'leagues', l,
          {
            leagueid: l.league_id,
          }, cb);
      }, cb);
    });
  });
}, 30 * 60 * 1000);
invokeInterval((cb) => {
  db.raw('select distinct team_id from team_match').asCallback((err, result) => {
    if (err)
        {
      return cb(err);
    }
    async.eachSeries(result.rows, (m, cb) => {
      const container = utility.generateJob('api_teams',
        {
                // 2 is the smallest team id, use as default
          team_id: m.team_id || 2,
        });
      utility.getData(container.url, (err, body) => {
        if (err)
                {
          return cb(err);
        }
        if (!body.teams)
                {
          return cb();
        }
        const t = body.teams[0];
        queries.upsert(db, 'teams', t,
          {
            team_id: t.team_id,
          }, cb);
      });
    }, cb);
  });
}, 60 * 60 * 1000);
invokeInterval((cb) => {
  const container = utility.generateJob('api_heroes',
    {
      language: 'english',
    });
  utility.getData(container.url, (err, body) => {
    if (err)
        {
      return cb(err);
    }
    if (!body || !body.result || !body.result.heroes)
        {
      return cb();
    }
    async.eachSeries(body.result.heroes, (hero, cb) => {
      queries.upsert(db, 'heroes', hero,
        {
          id: hero.id,
        }, cb);
    }, cb);
  });
}, 60 * 60 * 1000);
invokeInterval((cb) => {
  const container = utility.generateJob('api_items',
    {
      language: 'english',
    });
  utility.getData(container.url, (err, body) => {
    if (err)
        {
      return cb(err);
    }
    if (!body || !body.result || !body.result.items)
        {
      return cb();
    }
    async.eachSeries(body.result.items, (item, cb) => {
      queries.upsert(db, 'items', item,
        {
          id: item.id,
        }, cb);
    });
  });
}, 60 * 60 * 1000);
invokeInterval((cb) => {
  utility.getData(utility.generateJob('api_item_schema').url, (err, body) => {
    if (err)
        {
      return cb(err);
    }
        // Get the item schema URL
    if (!body || !body.result || !body.result.items_game_url)
        {
      return cb();
    }
    utility.getData(body.result.items_game_url, (err, body) => {
      if (err)
            {
        return cb(err);
      }
      const item_data = vdf.parse(body);
      console.log(Object.keys(item_data.items_game.items).length);
      async.eachLimit(Object.keys(item_data.items_game.items), 5, (item_id, cb) => {
        const item = item_data.items_game.items[item_id];
        item.item_id = Number(item_id);
        const hero = item.used_by_heroes && typeof (item.used_by_heroes) === 'object' && Object.keys(item.used_by_heroes)[0];
        if (hero)
                {
          item.used_by_heroes = hero;
        }
                // console.log(item);
        if (!item.item_id)
                {
          return cb();
        }
        if (item.image_inventory)
                {
          const spl = item.image_inventory.split('/');
          const iconname = spl[spl.length - 1];
          utility.getData(
            {
              url: utility.generateJob('api_item_icon',
                {
                  iconname,
                }).url,
              noRetry: true,
            }, (err, body) => {
            if (err || !body || !body.result)
                        {
              return cb();
            }
            item.image_path = body.result.path;
            insert(cb);
          });
        }
        else
                {
          insert(cb);
        }

        function insert(cb)
                {
                    // console.log(item);
          return queries.upsert(db, 'cosmetics', item,
            {
              item_id: item.item_id,
            }, cb);
        }
      }, cb);
    });
  });
}, 12 * 60 * 60 * 1000);

function invokeInterval(func, delay)
{
    // invokes the function immediately, waits for callback, waits the delay, and then calls it again
  (function invoker()
    {
    redis.get('worker:' + func.name, (err, fresh) => {
      if (err)
            {
        return setTimeout(invoker, delay);
      }
      if (fresh && config.NODE_ENV !== 'development')
            {
        console.log('skipping %s', func.name);
        return setTimeout(invoker, delay);
      }
      else
            {
        console.log('running %s', func.name);
        console.time(func.name);
        func((err) => {
          if (err)
                    {
                        // log the error, but wait until next interval to retry
            console.error(err);
          }
          else
                    {
                        // mark success, don't redo until this key expires
            redis.setex('worker:' + func.name, delay / 1000 * 0.9, '1');
          }
          console.timeEnd(func.name);
          setTimeout(invoker, delay);
        });
      }
    });
  })();
}
