var queue = require('./queue');
var rankQueue = queue.getQueue('rank');
var db = require('./db');
var redis = require('./redis');
var queries = require('./queries');
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var async = require('async');
rankQueue.process(10, processRank);

function processRank(job, cb)
{
    var player = job.data.payload;
    console.log(player);
    if (player.games && player.wins && player.solo_competitive_rank)
    {
        //bootstrapping mode, we have all the data in the job
        updateRank(player);
    }
    else if (false)
    {
        //TODO may be more performant to cache the games/wins/MMR somewhere and only do the expensive query for consistency check--use direct update query most of the time?
        // If we do this we may need to do updates more often
        // also should save the counts back to Redis when we do the DB query
        redis.incrby(generateRedisKey('games'), 1);
        redis.incrby(generateRedisKey('wins'), Number(isRadiant(player) === player.radiant_win));
        redis.set(generateRedisKey('solo_competitive_rank'), player.solo_competitive_rank);
        async.parallel([function(cb)
            {
                getRankMetadata('games', cb);
        },
            function(cb)
            {
                getRankMetadata('wins', cb);
            },
            function(cb)
            {
                getRankMetadata('solo_competitive_rank', cb);
            }
        ], function(err, stats)
        {
            if (err)
            {
                return cb(err);
            }
            updateRank(player);
        });
    }
    else
    {
        //db mode, lookup of current games, wins
        //we have solo_competitive_rank for this player from the mmr job
        db.raw(`
            SELECT account_id, hero_id, count(hero_id) as games, sum(case when ((player_slot < 64) = radiant_win) then 1 else 0 end) as wins
            FROM player_matches
            JOIN matches
            ON player_matches.match_id = matches.match_id
            WHERE account_id = ?
            AND hero_id = ?
            AND lobby_type = 7
            GROUP BY player_matches.account_id, hero_id;
    `, [player.account_id, player.hero_id]).asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            if (!result.rows || !result.rows[0])
            {
                return cb("no players found");
            }
            var dbPlayer = result.rows[0];
            dbPlayer.solo_competitive_rank = player.solo_competitive_rank;
            player = dbPlayer;
            updateRank(player);
        });
    }

    function getRankMetadata(key, cb)
    {
        redis.get(generateRedisKey(key), function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            player[key] = Number(result);
            cb(err);
        });
    }

    function generateRedisKey(key)
    {
        return ['hero_rankings', 'meta', player.account_id, player.hero_id, key].join(':');
    }

    function updateRank(player)
    {
        //set minimum # of games to be ranked
        if (player.games > 0)
        {
            var score = computeScore(player);
            if (!isNaN(score))
            {
                console.log(player.account_id, player.hero_id, score);
                redis.zadd('hero_rankings:' + player.hero_id, score, player.account_id);
            }
            cb();
        }
        else
        {
            return cb();
        }
    }
}
rankQueue.on('completed', function(job)
{
    job.remove();
});

function computeScore(player)
{
    return player.games * (player.wins / (player.games - player.wins + 1)) * player.solo_competitive_rank;
}