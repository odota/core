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
cQueue.process(10, processCache);
cQueue.on('completed', function(job)
{
    job.remove();
});

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
            return updateRankings(match, cb);
        }
    }, function(err)
    {
        if (err)
        {
            console.error(err);
        }
        try
        {
            if (match.origin === "scanner")
            {
                incrCounts(match);
            }
            updateBenchmarks(match);
        }
        catch (e)
        {
            console.error(e);
            throw e;
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
            if (metric !== undefined && !Number.isNaN(metric))
            {
                redis.zadd(["benchmarks", moment().startOf('hour').format('X'), key, p.hero_id].join(':'), metric, match.match_id);
            }
        }
    }
}

function updateRankings(match, cb)
{
    async.each(match.players, function(player, cb)
    {
        if (!config.ENABLE_RANKER || match.lobby_type !== 7 || player.account_id === constants.anonymous_account_id)
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
            //also add adjustable random factor to fallback to db for consistency check
            player.incr = Boolean(player.score) && Math.random() < 0.999;
            if (player.incr)
            {
                updateScore(redis, player, cb);
            }
            else
            {
                //db mode, lookup of current games, wins
                db.raw(`
            SELECT player_matches.account_id, hero_id, count(hero_id) as games, sum(case when ((player_slot < 64) = radiant_win) then 1 else 0 end) as wins
            FROM player_matches
            JOIN matches
            ON player_matches.match_id = matches.match_id
            WHERE player_matches.account_id = ?
            AND hero_id = ?
            AND lobby_type = 7
            GROUP BY player_matches.account_id, hero_id
            `, [player.account_id, player.hero_id]).asCallback(function(err, result)
                {
                    if (err)
                    {
                        console.error(err);
                        return cb(err);
                    }
                    if (!result.rows || !result.rows[0])
                    {
                        return cb("no players found");
                    }
                    var dbPlayer = result.rows[0];
                    player.games = dbPlayer.games;
                    player.wins = dbPlayer.wins;
                    updateScore(player, cb);
                });
            }
        });
    }, cb);
}

function incrCounts(match)
{
    //increment redis counts
    //count match
    redis.zadd("added_match", moment().format('X'), match.match_id);
    //picks
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