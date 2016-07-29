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
cQueue.on('completed', function(job)
{
    job.remove();
});

function processCache(job, cb)
{
    var match = job.data.payload;
    console.log('match: %s, %s', match.match_id, match.origin);
    async.parallel(
    {
        "updateRankings": function(cb)
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
        "updateMatchRating": function(cb)
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
        "incrCounts": function(cb)
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
        "updateBenchmarks": function(cb)
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
    }, function(err)
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
    var expire = moment().add(1, 'week').startOf('week').format('X');
    //count match for telemetry
    redis.zadd("added_match", moment().format('X'), match.match_id);
    //increment picks
    var radiant = [];
    var dire = [];
    for (var i = 0; i < match.players.length; i++)
    {
        var p = match.players[i];
        if (p.hero_id === 0)
        {
            //exclude this match
            return;
        }
        if (utility.isRadiant(p))
        {
            radiant.push(p.hero_id);
        }
        else
        {
            dire.push(p.hero_id);
        }
    }
    //compute singles, dyads, triads, etc.
    for (var i = 1; i < 4; i++)
    {
        addToPickResults(k_combinations(radiant, i), i, match.radiant_win, match);
        addToPickResults(k_combinations(dire, i), i, !match.radiant_win, match);
    }
    redis.incr('picks_match_count');
    redis.expireat('picks_match_count', expire);

    function addToPickResults(groups, i, win, m)
    {
        groups.forEach(function(g)
        {
            //sort and join the g into a unique key
            g = g.sort(function(a, b)
            {
                return a - b;
            }).join(',');
            //redis.zadd('picks:' + i + ":" + g, moment().format('X'), match.match_id);
            redis.zincrby('picks_counts:' + i, 1, g);
            redis.expireat('picks_counts:' + i, expire);
            if (win)
            {
                //redis.zadd('picks_wins:' + i + ":" + g, moment().format('X'), match.match_id);
                redis.zincrby('picks_wins_counts:' + i, 1, g);
                redis.expireat('picks_wins_counts:' + i, expire);
            }
        });
    }
}

function k_combinations(arr, k)
{
    var i, j, combs, head, tailcombs;
    if (k > arr.length || k <= 0)
    {
        return [];
    }
    if (k === arr.length)
    {
        return [arr];
    }
    if (k == 1)
    {
        combs = [];
        for (i = 0; i < arr.length; i++)
        {
            combs.push([arr[i]]);
        }
        return combs;
    }
    // Assert {1 < k < arr.length}
    combs = [];
    for (i = 0; i < arr.length - k + 1; i++)
    {
        head = arr.slice(i, i + 1);
        //recursively get all combinations of the remaining array
        tailcombs = k_combinations(arr.slice(i + 1), k - 1);
        for (j = 0; j < tailcombs.length; j++)
        {
            combs.push(head.concat(tailcombs[j]));
        }
    }
    return combs;
}

function updateRankings(match, cb)
{
    getMatchRating(redis, match, function(err, avg)
    {
        if (err)
        {
            return cb(err);
        }
        var match_score = (avg && !Number.isNaN(avg)) ? Math.pow(Math.max(avg/1000, 1), 6) : undefined;
        async.each(match.players, function(player, cb)
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
    getMatchRating(redis, match, function(err, avg)
    {
        if (avg && !Number.isNaN(avg))
        {
            var rkey = 'match_ratings:' + utility.getStartOfBlockHours(config.MATCH_RATING_RETENTION_HOURS, 0);
            redis.zadd(rkey, avg, match.match_id);
            redis.expireat(rkey, utility.getStartOfBlockHours(config.MATCH_RATING_RETENTION_HOURS, 2));
            //for each player
            match.players.forEach(function(player)
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
