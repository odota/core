var config = require('./config');
var zlib = require('zlib');
var compute = require('./compute');
var computePlayerMatchData = compute.computePlayerMatchData;
var aggregator = require('./aggregator');
var async = require('async');
var constants = require('./constants');
var utility = require('./utility');
var filter = require('./filter');
var reduceAggregable = utility.reduceAggregable;
var enabled = config.ENABLE_PLAYER_CACHE;
var cEnabled = config.CASSANDRA_PLAYER_CACHE;
var redis;
var cassandra;
if (enabled)
{
    redis = require('./redis');
    if (cEnabled)
    {
        cassandra = require('./cassandra');
    }
}
//CREATE KEYSPACE yasp WITH REPLICATION = { 'class' : 'NetworkTopologyStrategy', 'datacenter1': 1 };
//CREATE TABLE yasp.player_caches (account_id bigint, match_id bigint, match text, PRIMARY KEY(account_id, match_id));
function readCache(account_id, options, cb)
{
    if (enabled)
    {
        if (cEnabled)
        {
            console.time('readcache');
            var query = 'SELECT match FROM player_caches WHERE account_id = ?';
            return cassandra.execute(query, [account_id],
            {
                prepare: true
            }, function(err, results)
            {
                if (err)
                {
                    console.log(err);
                    return cb(err);
                }
                if (!results.rows || !results.rows.length)
                {
                    return cb();
                }
                var matches = results.rows.map(function(m)
                {
                    return JSON.parse(m.match);
                });
                //get array of matches, filter, agg and return results
                var filtered = filter(matches, options.js_select);
                var aggData = aggregator(filtered, options.js_agg);
                console.timeEnd('readcache');
                cb(err,
                {
                    aggData: aggData
                });
            });
        }
        else
        {
            console.time('readcache');
            redis.get(new Buffer("player:" + account_id), function(err, result)
            {
                var cache = result ? JSON.parse(zlib.inflateSync(result)) : null;
                console.timeEnd('readcache');
                //console.log(result ? result.length : 0, JSON.stringify(cache).length);
                return cb(err, cache);
            });
        }
    }
    else
    {
        console.log("cache disabled");
        return cb();
    }
}

function writeCache(account_id, cache, cb)
{
    if (enabled)
    {
        if (cEnabled)
        {
            console.time("writecache");
            console.log("saving player cache to cassandra %s", account_id);
            var arr = cache.raw.map(function(m)
            {
                return reduceAggregable(m);
            });
            //upsert matches into store
            return async.each(arr, function(m, cb)
            {
                var query = 'INSERT INTO player_caches (account_id, match_id, match) VALUES (?, ?, ?)';
                cassandra.execute(query, [m.account_id, m.match_id, JSON.stringify(m)],
                {
                    prepare: true
                }, cb);
            }, function(err)
            {
                console.timeEnd("writecache");
                return cb(err);
            });
        }
        else
        {
            console.time("writecache");
            console.log("saving player cache to redis %s", account_id);
            redis.ttl("player:" + account_id, function(err, ttl)
            {
                if (err)
                {
                    return cb(err);
                }
                cache = {
                    aggData: cache.aggData
                };
                redis.setex(new Buffer("player:" + account_id), Number(ttl) > 0 ? Number(ttl) : 24 * 60 * 60 * config.UNTRACK_DAYS, zlib.deflateSync(JSON.stringify(cache)), function(err)
                {
                    console.timeEnd("writecache");
                    cb(err);
                });
            });
        }
    }
    else
    {
        return cb();
    }
}

function updateCache(match, cb)
{
    if (enabled)
    {
        var players = match.players;
        if (match.pgroup && players)
        {
            players.forEach(function(p)
            {
                //add account id to each player so we know what caches to update
                p.account_id = match.pgroup[p.player_slot].account_id;
                //add hero_id to each player so we update records with hero played
                p.hero_id = match.pgroup[p.player_slot].hero_id;
            });
        }
        async.eachSeries(players, function(player_match, cb)
        {
            if (player_match.account_id && player_match.account_id !== constants.anonymous_account_id)
            {
                readCache(player_match.account_id,
                {}, function(err, cache)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    //if player cache doesn't exist, skip
                    if (cache)
                    {
                        //join player with match to form player_match
                        for (var key in match)
                        {
                            player_match[key] = match[key];
                        }
                        computePlayerMatchData(player_match);
                        if (cEnabled)
                        {
                            writeCache(player_match.account_id,
                            {
                                raw: [player_match]
                            }, cb);
                        }
                        else
                        {
                            cache.aggData = aggregator([player_match], null, cache.aggData);
                            writeCache(player_match.account_id, cache, cb);
                        }
                    }
                    else
                    {
                        return cb();
                    }
                });
            }
            else
            {
                return cb();
            }
        }, cb);
    }
    else
    {
        return cb();
    }
}

function countPlayerCaches(cb)
{
    if (enabled)
    {
        if (cEnabled)
        {
            cassandra.execute('SELECT DISTINCT COUNT(account_id) FROM player_caches', [],
            {
                prepare: true
            }, function(err, result)
            {
                result = result && result.rows && result.rows[0] && result.rows[0].count ? result.rows[0].count.toNumber() : 0;
                return cb(err, result);
            });
        }
        else
        {
            redis.keys("player:*", function(err, result)
            {
                cb(err, result.length);
            });
        }
    }
    else
    {
        return cb(null, 0);
    }
}
module.exports = {
    readCache: readCache,
    writeCache: writeCache,
    updateCache: updateCache,
    countPlayerCaches: countPlayerCaches,
};