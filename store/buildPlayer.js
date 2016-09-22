/**
 * Functions to build player object
 **/
const async = require('async');
const config = require('../config.js');
const constants = require('dotaconstants');
const queries = require('../store/queries');
const utility = require('../util/utility');
const aggregator = require('../util/aggregator');
const generatePositionData = utility.generatePositionData;
const player_fields = constants.player_fields;
const subkeys = player_fields.subkeys;
const countCats = player_fields.countCats;
const getPlayer = queries.getPlayer;
const getPlayerMatches = queries.getPlayerMatches;
const getPlayerRankings = queries.getPlayerRankings;
const getPlayerRatings = queries.getPlayerRatings;
// Fields to project from Cassandra player caches
const cacheProj = ['account_id', 'match_id', 'player_slot', 'version', 'start_time', 'duration', 'game_mode', 'lobby_type', 'radiant_win', 'hero_id', 'game_mode', 'skill', 'duration', 'kills', 'deaths', 'assists', 'last_hits', 'gold_per_min'];
const cacheFilters = ['heroes', 'hero_id', 'lane_role', 'game_mode', 'lobby_type', 'region', 'patch', 'start_time'];
// Fields to aggregate on
// optimize by only aggregating certain columns based on tab
// set query.js_agg based on this
const basicAggs = ['match_id', 'win', 'lose'];
const aggs = {
  index: basicAggs.concat('hero_id'),
  matches: basicAggs,
  heroes: basicAggs.concat('heroes'),
  peers: basicAggs.concat('teammates'),
  pros: basicAggs.concat('teammates'),
  activity: basicAggs.concat('start_time'),
  records: basicAggs.concat(Object.keys(subkeys)),
  counts: basicAggs.concat(Object.keys(countCats)).concat(['multi_kills', 'kill_streaks', 'lane_role']),
  histograms: basicAggs.concat(Object.keys(subkeys)),
  trends: basicAggs.concat(Object.keys(subkeys)),
  wardmap: basicAggs.concat(['obs', 'sen']),
  items: basicAggs.concat(['purchase_time', 'item_usage', 'item_uses', 'purchase', 'item_win']),
  wordcloud: basicAggs.concat(['my_word_counts', 'all_word_counts']),
  rating: basicAggs,
  rankings: basicAggs,
};
const deps = {
  'teammates': 'heroes',
  'win': 'radiant_win',
  'lose': 'radiant_win',
};
// TODO decommission this and aggregator with SPA
function buildPlayer(options, cb)
{
  const db = options.db;
  const redis = options.redis;
  let account_id = options.account_id;
  const orig_account_id = account_id;
  const info = options.info || 'index';
  const query = options.query;
  if (Number.isNaN(account_id))
    {
    return cb('non-numeric account_id');
  }
  if (Number(account_id) === constants.anonymous_account_id)
    {
    return cb('cannot generate profile for anonymous account_id');
  }
  let queryObj = {
    select: query,
  };
  account_id = Number(account_id);
    // select player_matches with this account_id
  queryObj.select.account_id = account_id;
  queryObj = preprocessQuery(queryObj);
    // 1 filter expected for account id
  const filter_exists = queryObj.filter_count > 1;
    // choose fields to aggregate based on tab
  const obj = {};
  aggs[info].forEach((k) => {
    obj[k] = 1;
  });
  queryObj.js_agg = obj;
    // fields to project from the Cassandra cache
  queryObj.project = cacheProj.concat(Object.keys(queryObj.js_agg).map((k) => {
    return deps[k] || k;
  })).concat(filter_exists ? cacheFilters : []).concat(query.desc ? query.desc : []);
    // Find player in db
  console.time('[PLAYER] getPlayer ' + account_id);
  getPlayer(db, account_id, (err, player) => {
    console.timeEnd('[PLAYER] getPlayer ' + account_id);
    if (err)
        {
      return cb(err);
    }
    player = player ||
      {
        account_id,
        personaname: account_id,
      };
    getPlayerMatches(orig_account_id, queryObj, processResults);

    function processResults(err, matches)
        {
      if (err)
            {
        return cb(err);
      }
      const desc = queryObj.keywords.desc || 'match_id';
      const limit = queryObj.keywords.limit ? Number(queryObj.keywords.limit) : undefined;
            // sort
      matches = matches.sort((a, b) => {
        if (a[desc] === undefined || b[desc] === undefined)
                {
          return a[desc] === undefined ? 1 : -1;
        }
        return Number(b[desc]) - Number(a[desc]);
      });
            // limit
      matches = matches.slice(0, limit);
            // aggregate
      const aggData = aggregator(matches, queryObj.js_agg);
      async.parallel(
        {
          profile(cb)
                {
            return cb(null, player);
          },
          win(cb)
                {
            return cb(null, aggData.win.sum);
          },
          lose(cb)
                {
            return cb(null, aggData.lose.sum);
          },
          matches(cb)
                {
            if (info === 'index' || info === 'matches')
                    {
              const project = ['match_id', 'player_slot', 'hero_id', 'game_mode', 'kills', 'deaths', 'assists', 'version', 'skill', 'radiant_win', 'start_time', 'duration'].concat(queryObj.keywords.desc || []);
              const limit = Number(queryObj.keywords.limit) || (info === 'index' ? 20 : undefined);
                        // project
              matches = matches.map((pm) => {
                const obj = {};
                project.forEach((key) => {
                  obj[key] = pm[key];
                });
                return obj;
              });
                        // limit
              matches = matches.slice(0, limit);
              queries.getMatchesSkill(db, matches, options, cb);
            }
            else
                    {
              cb(null, []);
            }
          },
          heroes_list(cb)
                {
                    // convert heroes hash to array and sort
            let heroes_list = [];
            if (aggData.hero_id)
                    {
              for (var id in aggData.hero_id.counts)
                        {
                            // exclude invalid hero_ids
                if (Number(id))
                            {
                  heroes_list.push(
                    {
                      hero_id: id,
                      games: aggData.hero_id.counts[id],
                      win: aggData.hero_id.win_counts[id],
                    });
                }
              }
            }
            else if (aggData.heroes)
                    {
              const heroes = aggData.heroes;
              for (var id in heroes)
                        {
                const h = heroes[id];
                heroes_list.push(h);
              }
            }
            heroes_list.sort((a, b) => {
              return b.games - a.games;
            });
            heroes_list = heroes_list.slice(0, info === 'index' ? 20 : undefined);
            return cb(null, heroes_list);
          },
          teammate_list(cb)
                {
            if (info === 'peers')
                    {
              queries.getPeers(db, aggData.teammates, player, cb);
            }
            else if (info === 'pros')
                    {
              queries.getProPeers(db, aggData.teammates, player, cb);
            }
            else
                    {
              return cb();
            }
          },
          mmr_estimate(cb)
                {
            queries.getMmrEstimate(db, redis, account_id, cb);
          },
          ratings(cb)
                {
            if (info === 'rating')
                    {
              getPlayerRatings(db, account_id, cb);
            }
            else
                    {
              cb();
            }
          },
          solo_competitive_rank(cb)
                {
            redis.zscore('solo_competitive_rank', account_id, cb);
          },
          competitive_rank(cb)
                {
            redis.zscore('competitive_rank', account_id, cb);
          },
          rankings(cb)
                {
            if (info === 'rankings')
                    {
              getPlayerRankings(redis, account_id, cb);
            }
            else
                    {
              return cb();
            }
          },
          activity(cb)
                {
            if (info === 'activity')
                    {
              return cb(null, aggData.start_time);
            }
            else
                    {
              return cb();
            }
          },
          wardmap(cb)
                {
            if (info === 'wardmap')
                    {
                        // generally position data function is used to generate heatmap data for each player in a natch
                        // we use it here to generate a single heatmap for aggregated counts
              const ward_data = {
                obs: aggData.obs,
                sen: aggData.sen,
              };
              const ward_counts = {
                obs: ward_data.obs.counts,
                sen: ward_data.sen.counts,
              };
              const d = {
                'obs': true,
                'sen': true,
              };
              generatePositionData(d, ward_counts);
              const obj = {
                posData: [d],
              };
              return cb(null, Object.assign(
                        {}, obj, ward_data));
            }
            else
                    {
              return cb();
            }
          },
          wordcloud(cb)
                {
            if (info === 'wordcloud')
                    {
              return cb(null,
                {
                  my_word_counts: aggData.my_word_counts,
                  all_word_counts: aggData.all_word_counts,
                });
            }
            else
                    {
              return cb();
            }
          },
          aggData(cb)
                {
            if (info === 'histograms' || info === 'counts' || info === 'trends' || info === 'items' || info === 'skills' || info === 'records')
                    {
              return cb(null, aggData);
            }
            else
                    {
              return cb();
            }
          },
        }, cb);
    }
  });
}

function preprocessQuery(query)
{
    // check if we already processed to ensure idempotence
  if (query.processed)
    {
    return;
  }
    // select,the query received, build the mongo query and the js filter based on this
  query.db_select = {};
  query.filter = {};
  query.keywords = {};
  query.filter_count = 0;
  const dbAble = {
    'account_id': 1,
  };
    // reserved keywords, don't treat these as filters
  const keywords = {
    'desc': 1,
    'project': 1,
    'limit': 1,
  };
  for (const key in query.select)
    {
    if (!keywords[key])
        {
            // arrayify the element
      query.select[key] = [].concat(query.select[key]).map((e) => {
        if (typeof e === 'object')
                {
                    // just return the object if it's an array or object
          return e;
        }
                // numberify this element
        return Number(e);
      });
      if (dbAble[key])
            {
        query.db_select[key] = query.select[key][0];
      }
      query.filter[key] = query.select[key];
      query.filter_count += 1;
    }
    else
        {
      query.keywords[key] = query.select[key];
    }
  }
    // absolute limit for number of matches to extract
  query.limit = config.PLAYER_MATCH_LIMIT;
    // mark this query processed
  query.processed = true;
    // console.log(query);
  return query;
}
module.exports = buildPlayer;
