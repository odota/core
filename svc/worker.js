/**
 * Worker running tasks on timed intervals
 **/
var config = require('../config');
var constants = require('dotaconstants');
var redis = require('../store/redis');
var queue = require('../store/queue');
var db = require('../store/db');
var queries = require('../store/queries');
var buildSets = require('../store/buildSets');
var utility = require('../util/utility');
var getMMStats = require('../util/getMMStats');
var async = require('async');
var moment = require('moment');
var fs = require('fs');
var sql = {};
var sqlq = fs.readdirSync('./sql');
sqlq.forEach(function (f)
{
    sql[f.split('.')[0]] = fs.readFileSync('./sql/' + f, 'utf8');
});
console.log("[WORKER] starting worker");
invokeInterval(function getPvgnaAPI(cb) {
    utility.getData('https://pvgna.com/yasp', function (err, guides)
    {
        if (err) {
            console.log("Received a bad response from pvgna");
            return cb(err);
        }
        redis.set("pvgna", JSON.stringify(guides), cb);
    });
}, 60 * 60 * 1000 * 24) //Once every day
invokeInterval(function doBuildSets(cb)
{
    buildSets(db, redis, cb);
}, 60 * 1000);
invokeInterval(function mmStats(cb)
{
    getMMStats(redis, cb);
}, config.MMSTATS_DATA_INTERVAL * 60 * 1000); //Sample every 3 minutes
invokeInterval(function buildDistributions(cb)
{
    async.parallel(
    {
        "country_mmr": function (cb)
        {
            var mapFunc = function (results)
            {
                results.rows = results.rows.map(function (r)
                {
                    var ref = constants.countries[r.loccountrycode];
                    r.common = ref ? ref.name.common : r.loccountrycode;
                    return r;
                });
            };
            loadData("country_mmr", mapFunc, cb);
        },
        "mmr": function (cb)
        {
            var mapFunc = function (results)
            {
                var sum = results.rows.reduce(function (prev, current)
                {
                    return {
                        count: prev.count + current.count
                    };
                },
                {
                    count: 0
                });
                results.rows = results.rows.map(function (r, i)
                {
                    r.cumulative_sum = results.rows.slice(0, i + 1).reduce(function (prev, current)
                    {
                        return {
                            count: prev.count + current.count
                        };
                    },
                    {
                        count: 0
                    }).count;
                    return r;
                });
                results.sum = sum;
            };
            loadData("mmr", mapFunc, cb);
        }
    }, function (err, result)
    {
        if (err)
        {
            return cb(err);
        }
        for (var key in result)
        {
            redis.set('distribution:' + key, JSON.stringify(result[key]));
        }
        cb(err);
    });

    function loadData(key, mapFunc, cb)
    {
        db.raw(sql[key]).asCallback(function (err, results)
        {
            if (err)
            {
                return cb(err);
            }
            mapFunc(results);
            return cb(err, results);
        });
    }
}, 60 * 60 * 1000 * 6);
invokeInterval(function cleanQueues(cb)
{
    queue.cleanup(redis, cb);
}, 60 * 60 * 1000);
invokeInterval(function notablePlayers(cb)
{
    var container = utility.generateJob("api_notable",
    {});
    utility.getData(container.url, function (err, body)
    {
        if (err)
        {
            return cb(err);
        }
        async.each(body.player_infos, function (p, cb)
        {
            queries.upsert(db, 'notable_players', p,
            {
                account_id: p.account_id
            }, cb);
        }, cb);
    });
}, 10 * 60 * 1000);
invokeInterval(function leagues(cb)
{
    var container = utility.generateJob("api_leagues",
    {});
    utility.getData(container.url, function (err, api_leagues)
    {
        if (err)
        {
            return cb(err);
        }
        utility.getData('https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/items/leagues.json', function (err, leagues)
        {
            if (err)
            {
                return cb(err);
            }
            async.each(api_leagues.result.leagues, function (l, cb)
            {
                if (leagues[l.leagueid])
                {
                    l.tier = leagues[l.leagueid].tier;
                    l.ticket = leagues[l.leagueid].ticket;
                    l.banner = leagues[l.leagueid].banner;
                }
                l.name = l.name.substring("#DOTA_Item_".length).split('_').join(' ');
                if (l.tier === "professional" || l.tier === "premium")
                {
                    redis.sadd('pro_leagueids', l.leagueid);
                }
                queries.upsert(db, 'leagues', l,
                {
                    leagueid: l.league_id
                }, cb);
            }, cb);
        });
    });
}, 10 * 60 * 1000);
invokeInterval(function teams(cb)
{
    db.raw(`select distinct team_id from team_match`).asCallback(function (err, result)
    {
        if (err)
        {
            return cb(err);
        }
        async.eachSeries(result.rows, function (m, cb)
        {
            var container = utility.generateJob("api_teams",
            {
                // 2 is the smallest team id, use as default
                team_id: m.team_id || 2,
            });
            utility.getData(container.url, function (err, body)
            {
                if (err)
                {
                    return cb(err);
                }
                if (!body.teams)
                {
                    return cb();
                }
                var t = body.teams[0];
                queries.upsert(db, 'teams', t,
                {
                    team_id: t.team_id
                }, cb);
            });
        }, cb);
    });
}, 60 * 60 * 1000);
invokeInterval(function heroes(cb)
{
    async.eachSeries(Object.keys(constants.heroes), function (hero_id, cb)
    {
        const hero = constants.heroes[hero_id];
        queries.upsert(db, 'heroes', hero,
        {
            id: hero.id
        }, cb);
    });
}, 60 * 60 * 1000);

function invokeInterval(func, delay)
{
    //invokes the function immediately, waits for callback, waits the delay, and then calls it again
    (function invoker()
    {
        redis.get('worker:' + func.name, function (err, fresh)
        {
            if (err)
            {
                return setTimeout(invoker, delay);
            }
            if (fresh && config.NODE_ENV !== "development")
            {
                console.log("skipping %s", func.name);
                return setTimeout(invoker, delay);
            }
            else
            {
                console.log("running %s", func.name);
                console.time(func.name);
                func(function (err)
                {
                    if (err)
                    {
                        //log the error, but wait until next interval to retry
                        console.error(err);
                    }
                    else
                    {
                        //mark success, don't redo until this key expires
                        redis.setex('worker:' + func.name, delay / 1000 * 0.9, "1");
                    }
                    console.timeEnd(func.name);
                    setTimeout(invoker, delay);
                });
            }
        });
    })();
}
