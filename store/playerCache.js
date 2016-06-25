/**
 * Provides methods for storing player match data in a faster caching layer
 **/
var config = require('../config');
var constants = require('../constants');
var enabled = config.ENABLE_CASSANDRA_MATCH_STORE_READ;
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
        var query = util.format('SELECT %s FROM player_caches WHERE account_id = ? ORDER BY match_id DESC', options.project.join(','));
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
                if (filter([m], options.filter).length)
                {
                    matches.push(m);
                }
            }
        }).on('end', function(err)
        {
            //stream ended, there aren't any more rows
            return cb(err, matches);
        }).on('error', function(err)
        {
            throw err;
        });
    }
    else
    {
        return cb(null, []);
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
                if (match.pgroup[p.player_slot])
                {
                    //add account id to each player so we know what caches to update
                    p.account_id = match.pgroup[p.player_slot].account_id;
                    //add hero_id to each player so we update records with hero played
                    p.hero_id = match.pgroup[p.player_slot].hero_id;
                }
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

module.exports = {
    readCache: readCache,
    writeCache: writeCache,
    updateCache: updateCache,
};
