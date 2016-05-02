/**
 * Provides methods for storing player match data in a faster caching layer
 **/
var config = require('../config');
var constants = require('../constants');
var enabled = config.ENABLE_PLAYER_CACHE;
var compute = require('../util/compute');
var computeMatchData = compute.computeMatchData;
var filter = require('../util/filter');
var utility = require('../util/utility');
var cassandra = enabled ? require('./cassandra') : undefined;
var async = require('async');
var serialize = utility.serialize;
var deserialize = utility.deserialize;
var util = require('util');
var reduceAggregable = utility.reduceAggregable;

function readCache(account_id, options, cb)
{
    if (enabled)
    {
        var query = util.format('SELECT %s FROM player_caches WHERE account_id = ?', options.cacheProject.join(','));
        var matches = [];
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
                    matches.push(m);
                }
            }
        }).on('end', function(err)
        {
            //stream ended, there aren't any more rows
            return cb(err,
            {
                raw: matches,
            });
        }).on('error', function(err)
        {
            throw err;
        });
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
                    if (key !== 'players')
                    {
                        player_match[key] = match[key];
                    }
                }
                computeMatchData(player_match);
                writeCache(player_match.account_id,
                {
                    raw: [player_match]
                }, cb);
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
    if (!cache || !enabled || config.ENABLE_CASSANDRA_MATCH_STORE_READ)
    {
        console.log('player cache validation skipped due to not needed');
        return cb();
    }
    //set key in redis to mark cache audited, don't do it again until timeout
    redis.get('player_cache_audit:' + account_id, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        if (result)
        {
            console.log('player cache validation skipped due to recent audit');
            return cb(null, true);
        }
        else if (!Number.isNaN(account_id))
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
            console.log('player cache validation skipped due to non-numeric account_id');
            cb(null, true);
        }
    });
}
module.exports = {
    readCache: readCache,
    writeCache: writeCache,
    updateCache: updateCache,
    validateCache: validateCache,
};
