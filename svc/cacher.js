/**
 * Worker to handle counting and caching tasks performed when a match is inserted or parsed.
 * All operations in this worker should deal with ephemeral data (can be reconstructed from persistent data stores)
 **/
var constants = require('dotaconstants');
var config = require('../config');
var redis = require('../store/redis');
var queue = require('../store/queue');
var queries = require('../store/queries');
var utility = require('../util/utility');
var benchmarks = require('../util/benchmarks');
var cQueue = queue.getQueue('cache');
var moment = require('moment');
var async = require('async');
var getMatchRating = queries.getMatchRating;
cQueue.process(10, processCache);
cQueue.on('completed', function (job)
{
    job.remove();
});

function processCache(job, cb)
{
    var match = job.data.payload;
    console.log('match: %s, %s', match.match_id, match.origin);
    async.parallel(
    {
        "updateRankings": function (cb)
        {
            if (match.origin === "scanner")
            {
                return updateRankings(match, cb);
            }
            else
            {
                return cb();
            }
        },
        "updateMatchRating": function (cb)
        {
            if (match.origin === "scanner")
            {
                return updateMatchRating(match, cb);
            }
            else
            {
                return cb();
            }
        },
        "incrCounts": function (cb)
        {
            try
            {
                if (match.origin === "scanner")
                {
                    incrCounts(match);
                }
                cb();
            }
            catch (e)
            {
                return cb(e);
            }
        },
        "updateBenchmarks": function (cb)
        {
            try
            {
                if (match.origin === "scanner")
                {
                    updateBenchmarks(match);
                }
                cb();
            }
            catch (e)
            {
                return cb(e);
            }
        }
    }, function (err)
    {
        if (err)
        {
            console.error(err);
        }
        return cb(err);
    });
}

function incrCounts(match)
{
    //count match for telemetry
    redis.zadd("added_match", moment().format('X'), match.match_id);
    //increment picks
    utility.generateMatchups(match).forEach(function (key)
    {
        redis.hincrby('matchups', key, 1);
    });
}

function updateRankings(match, cb)
{
    getMatchRating(redis, match, function (err, avg)
    {
        if (err)
        {
            return cb(err);
        }
        var match_score = (avg && !Number.isNaN(avg)) ? Math.pow(Math.max(avg / 1000, 1), 6) : undefined;
        async.each(match.players, function (player, cb)
        {
            if (!player.account_id || player.account_id === constants.anonymous_account_id)
            {
                return cb();
            }
            player.radiant_win = match.radiant_win;
            var start = moment().startOf('quarter').format('X');
            var expire = moment().add(1, 'quarter').startOf('quarter').format('X');
            var win = Number(utility.isRadiant(player) === player.radiant_win);
            var player_score = win ? match_score : 0;
            if (player_score && utility.isSignificant(match))
            {
                redis.zincrby(['hero_rankings', start, player.hero_id].join(':'), player_score, player.account_id);
                redis.expireat(['hero_rankings', start, player.hero_id].join(':'), expire);
            }
            cb();
        }, cb);
    });
}

function updateBenchmarks(match)
{
    for (var i = 0; i < match.players.length; i++)
    {
        var p = match.players[i];
        if (!p.hero_id)
        {
            //exclude this match
            return;
        }
        for (var key in benchmarks)
        {
            var metric = benchmarks[key](match, p);
            if (metric !== undefined && metric !== null && !Number.isNaN(metric))
            {
                var rkey = ["benchmarks", utility.getStartOfBlockHours(config.BENCHMARK_RETENTION_HOURS, 0), key, p.hero_id].join(':');
                redis.zadd(rkey, metric, match.match_id);
                //expire at time two blocks later (after prev/current cycle)
                redis.expireat(rkey, utility.getStartOfBlockHours(config.BENCHMARK_RETENTION_HOURS, 2));
            }
        }
    }
}

function updateMatchRating(match, cb)
{
    getMatchRating(redis, match, function (err, avg)
    {
        if (avg && !Number.isNaN(avg))
        {
            var rkey = 'match_ratings:' + utility.getStartOfBlockHours(config.MATCH_RATING_RETENTION_HOURS, 0);
            redis.zadd(rkey, avg, match.match_id);
            redis.expireat(rkey, utility.getStartOfBlockHours(config.MATCH_RATING_RETENTION_HOURS, 2));
            //for each player
            match.players.forEach(function (player)
            {
                if (player.account_id && player.account_id !== constants.anonymous_account_id)
                {
                    //push into list, limit elements
                    redis.lpush('mmr_estimates:' + player.account_id, avg);
                    redis.ltrim('mmr_estimates:' + player.account_id, 0, 19);
                }
            });
            cb();
        }
        else
        {
            return cb(err);
        }
    });
}
