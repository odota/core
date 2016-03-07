var queue = require('./queue');
var rankQueue = queue.getQueue('rank');
var db = require('./db');
var redis = require('./redis');
var queries = require('./queries');
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var async = require('async');
rankQueue.process(1, processRank);

function processRank(job, cb)
{
    var player = job.data.payload;
    if (player.bootstrap)
    {
        //bootstrap mode, we have all the data in the job
        if (player.solo_competitive_rank)
        {
            redis.zadd('solo_competitive_rank', player.solo_competitive_rank, player.account_id);
        }
        //console.log(player);
        updateScore(player, cb);
    }
    else
    {
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
            //make sure we have existing score if we want to incr?  otherwise players who just joined rankings will have incorrect data until randomly selected for DB audit
            //also add adjustable random factor to fallback to db for consistency check
            player.incr = Boolean(player.score) && Math.random() < 0.99;
            if (player.incr)
            {
                updateScore(player, cb);
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
    }
}
rankQueue.on('completed', function(job)
{
    job.remove();
});

function updateScore(player, cb)
{
    if (player.incr)
    {
        var win = Number(isRadiant(player) === player.radiant_win);
        //TODO possible inconsistency if we exit/crash after this incr but before completion
        redis.hincrby('wins:' + player.account_id, player.hero_id, win);
        redis.hincrby('games:' + player.account_id, player.hero_id, 1);
        player.wins += win;
        player.games += 1;
    }
    else
    {
        redis.hset('wins:' + player.account_id, player.hero_id, player.wins);
        redis.hset('games:' + player.account_id, player.hero_id, player.games);
    }
    var scaleF = 0.00001;
    var winRatio = (player.wins / (player.games - player.wins + 1));
    var mmrBonus = Math.pow(player.solo_competitive_rank, 2);
    redis.zadd('hero_rankings:' + player.hero_id, scaleF * player.games * winRatio * mmrBonus, player.account_id);
    console.log("ranked %s, %s", player.account_id, player.hero_id);
    cb();
}