/**
 * Provides methods for storing player match data in a faster caching layer
 **/
var config = require('./config');
var zlib = require('zlib');
var compute = require('./compute');
var computePlayerMatchData = compute.computePlayerMatchData;
var aggregator = require('./aggregator');
var async = require('async');
var constants = require('./constants');
var utility = require('./utility');
var serialize = utility.serialize;
var deserialize = utility.deserialize;
var filter = require('./filter');
var util = require('util');
var reduceAggregable = utility.reduceAggregable;
var enabled = config.ENABLE_PLAYER_CACHE;
var cEnabled = config.ENABLE_CASSANDRA_PLAYER_CACHE;
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

function readCache(account_id, options, cb)
{
    if (enabled)
    {
        if (cEnabled)
        {
            //TODO currently aggregator does live significance check.  Persist it to store so we can project fewer fields?
            var proj = ['account_id', 'match_id', 'player_slot', 'version', 'start_time', 'duration', 'game_mode', 'lobby_type', 'radiant_win'];
            var table = ['hero_id', 'player_win', 'game_mode', 'skill', 'duration', 'kills', 'deaths', 'assists', 'last_hits', 'gold_per_min', 'parse_status'];
            var filters = ['pgroup', 'hero_id', 'isRadiant', 'player_win', 'lane_role', 'game_mode', 'lobby_type', 'region', 'patch', 'start_time', 'purchase'];
            var query = util.format('SELECT %s FROM player_caches WHERE account_id = ? ORDER BY match_id ASC', Object.keys(options.js_agg).concat(proj).concat(table).concat(options.filter_count > 1 ? filters : []).join(','));
            var aggData = aggregator([], options.js_agg);
            return cassandra.stream(query, [account_id],
            {
                prepare: true,
                fetchSize: 1000,
                autoPage: true,
            }).on('readable', function()
            {
                //readable is emitted as soon a row is received and parsed
                var m;
                while (m = this.read())
                {
                    m = deserialize(m);
                    if (filter([m], options.js_select).length)
                    {
                        aggData = aggregator([m], options.js_agg, aggData);
                    }
                }
            }).on('end', function(err)
            {
                //stream ended, there aren't any more rows
                return cb(err,
                {
                    aggData: aggData
                });
            }).on('error', function(err)
            {
                throw err;
            });
        }
        else
        {
            redis.get(new Buffer("player:" + account_id), function(err, result)
            {
                var cache = result ? JSON.parse(zlib.inflateSync(result)) : null;
                //console.log(result ? result.length : 0, JSON.stringify(cache).length);
                return cb(err, cache);
            });
        }
    }
    else
    {
        return cb();
    }
}

function writeCache(account_id, cache, cb)
{
    if (enabled)
    {
        if (cEnabled)
        {
            //console.log("saving player cache to cassandra %s", account_id);
            //upsert matches into store
            return async.each(cache.raw, function(m, cb)
            {
                m = serialize(reduceAggregable(m));
                var query = util.format('INSERT INTO player_caches (%s) VALUES (%s)', Object.keys(m).join(','), Object.keys(m).map(function(k)
                {
                    return '?';
                }).join(','));
                cassandra.execute(query, Object.keys(m).map(function(k)
                {
                    return m[k];
                }),
                {
                    prepare: true
                }, cb);
            }, function(err)
            {
                if (err)
                {
                    console.error(err.stack);
                }
                return cb(err);
            });
        }
        else
        {
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
                            cache.aggData = aggregator([player_match], null, cache.aggData);
                            writeCache(player_match.account_id, cache, cb);
                        }
                        else
                        {
                            return cb();
                        }
                    });
                }
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

function validateCache(db, redis, account_id, cache, cb)
{
    if (!cache || !enabled)
    {
        return cb();
    }
    //set key in redis to mark cache audited, don't do it again until timeout
    redis.get('player_cache_audit:' + account_id, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        if (!Number.isNaN(account_id) && !result)
        {
            db('player_matches').count().where(
            {
                account_id: Number(account_id)
            }).asCallback(function(err, count)
            {
                if (err)
                {
                    return cb(err);
                }
                count = Number(count[0].count);
                //console.log(cache);
                //console.log(Object.keys(cache.aggData.matches).length, count);
                var cacheValid = cache && cache.aggData && cache.aggData.matches && Object.keys(cache.aggData.matches).length && Object.keys(cache.aggData.matches).length === count;
                redis.setex('player_cache_audit:' + account_id, 60 * 60 * 24 * 90, "1");
                return cb(err, cacheValid);
            });
        }
        else
        {
            //non-integer account_id (all/professional), skip validation (always valid)
            cb(null, true);
        }
    });
}

function countPlayerCaches(cb)
{
    if (enabled)
    {
        redis.keys("player:*", function(err, result)
        {
            cb(err, result.length);
        });
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
    validateCache: validateCache,
    countPlayerCaches: countPlayerCaches,
};
