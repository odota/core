/**
 * Worker to handle counting and caching tasks performed when a match is inserted or parsed.
 * All operations in this worker should deal with ephemeral data (can be reconstructed from persistent data stores)
 **/
const constants = require('dotaconstants');
const config = require('../config');
const redis = require('../store/redis');
//const cassandra = require('../store/cassandra');
const queue = require('../store/queue');
const queries = require('../store/queries');
const utility = require('../util/utility');
const benchmarks = require('../util/benchmarks');
const cQueue = queue.getQueue('cache');
const moment = require('moment');
const async = require('async');
const getMatchRating = queries.getMatchRating;
cQueue.process(50, processCache);
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
        "updateMatchups": function (cb)
        {
            if (match.origin === "scanner")
            {
                return updateMatchups(match, cb);
            }
            else
            {
                cb();
            }
        },
        "updateBenchmarks": function (cb)
        {
            if (match.origin === "scanner")
            {
                updateBenchmarks(match, cb);
            }
            else
            {
                cb();
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

function updateMatchups(match, cb)
{
    async.each(utility.generateMatchups(match, 1), function (key, cb)
    {
        //db.raw(`INSERT INTO matchups (matchup, num) VALUES (?, 1) ON CONFLICT(matchup) DO UPDATE SET num = matchups.num + 1`, [key]).asCallback(cb);
        //cassandra.execute(`UPDATE matchups SET num = num + 1 WHERE matchup = ?`, [key], {prepare: true}, cb);
        redis.hincrby('matchups', key, 1, cb);
    }, cb);
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

function updateBenchmarks(match, cb)
{
    for (var i = 0; i < match.players.length; i++)
    {
        var p = match.players[i];
        //only do if all players have heroes
        if (p.hero_id)
        {
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
    return cb();
}

function updateMatchRating(match, cb)
{
    getMatchRating(redis, match, function (err, avg)
    {
        if (avg && !Number.isNaN(avg))
        {
            //TODO persist to postgres
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
