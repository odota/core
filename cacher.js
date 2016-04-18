var queue = require('./queue');
var cQueue = queue.getQueue('cache');
var playerCache = require('./playerCache');
var updateCache = playerCache.updateCache;
var utility = require('./utility');
var queries = require('./queries');
var updateScore = queries.updateScore;
var redis = require('./redis');
var moment = require('moment');
var benchmarks = require('./benchmarks');
var async = require('async');
var constants = require('./constants');
var config = require('./config');
var db = require('./db');
var getMatchRating = require('./getMatchRating');
cQueue.process(10, processCache);
cQueue.on('completed', function(job)
{
    job.remove();
});
/**
 * Handles counting and caching tasks to be performed when a match is inserted or parsed.
 * All operations in this processor should deal with ephemeral data (can be reconstructed from persistent data stores)
 **/
function processCache(job, cb)
{
    var match = job.data.payload;
    console.log('match: %s', match.match_id);
    async.parallel(
    {
        "cache": function(cb)
        {
            return updateCache(match, cb);
        },
        "rankings": function(cb)
        {
            if (config.ENABLE_RANKER && match.lobby_type === 7 && match.origin === "scanner")
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
                redis.zadd(["benchmarks", utility.getStartOfBlockHours(config.BENCHMARK_RETENTION_HOURS, 0), key, p.hero_id].join(':'), metric, match.match_id);
            }
        }
    }
}

function updateRankings(match, cb)
{
    async.each(match.players, function(player, cb)
    {
        if (!player.account_id || player.account_id === constants.anonymous_account_id)
        {
            return cb();
        }
        async.parallel(
        {
            solo_competitive_rank: function(cb)
            {
                redis.zscore('solo_competitive_rank', player.account_id, cb);
            },
            score: function(cb)
            {
                redis.zscore('hero_rankings:' + player.hero_id, player.account_id, cb);
            },
            wins: function(cb)
            {
                redis.hget('wins:' + player.account_id, player.hero_id, cb);
            },
            games: function(cb)
            {
                redis.hget('games:' + player.account_id, player.hero_id, cb);
            }
        }, function(err, result)
        {
            if (err)
            {
                console.error(err);
                return cb(err);
            }
            if (!result.solo_competitive_rank)
            {
                //if no MMR on record, can't rank this player, finish fast
                return cb();
            }
            player.score = result.score;
            player.solo_competitive_rank = result.solo_competitive_rank;
            player.wins = result.wins;
            player.games = result.games;
            player.radiant_win = match.radiant_win;
            //make sure we have existing score if we want to incr, otherwise players who just joined rankings will have incorrect data until randomly selected for DB audit
            if (Boolean(player.score))
            {
                updateScore(player,
                {
                    redis: redis,
                    incr: true,
                }, cb);
            }
            else
            {
                return cb();
                //TODO temporarily skip uncached players to prevent it from holding up the cacher
                /*
                queries.getInitRanking(player,
                {
                    db: db,
                    redis: redis
                }, cb);
                */
            }
        });
    }, cb);
}

function updateMatchRating(match, cb)
{
    getMatchRating(redis, match, function(err, avg)
    {
        if (avg && !Number.isNaN(avg))
        {
            redis.zadd('match_ratings:' + utility.getStartOfBlockHours(config.MATCH_RATING_RETENTION_HOURS, 0), avg, match.match_id);
            //for each player
            match.players.forEach(function(player)
            {
                if (player.account_id !== constants.anonymous_account_id)
                {
                    //push into list, limit to 50 elements
                    redis.lpush('mmr_estimates:' + player.account_id, avg);
                    redis.ltrim('mmr_estimates:' + player.account_id, 0, 50);
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

function incrCounts(match)
{
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
}

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
        if (win)
        {
            //redis.zadd('picks_wins:' + i + ":" + g, moment().format('X'), match.match_id);
            redis.zincrby('picks_wins_counts:' + i, 1, g);
        }
    });
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