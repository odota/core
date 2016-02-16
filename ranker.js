var queue = require('./queue');
var rankQueue = queue.getQueue('rank');
var db = require('./db');
var redis = require('./redis');
var queries = require('./queries');
var utility = require('./utility');
var isRadiant = utility.isRadiant;
rankQueue.process(10, processRank);

function processRank(job, cb)
{
    var player = job.data.payload;
    redis.hgetall(generateRedisKey(), function(err, result)
    {
        if (err)
        {
            console.error(err);
            return cb(err);
        }
        if (player.bootstrap)
        {
            //bootstrapping mode, we have all the data in the job
            redis.hmset(generateRedisKey(), player);
            updateRank(player);
        }
        //randomly choose to do a full DB query instead of just updating to correct inconsistencies and update MMR occasionally (if we choose not to trigger updates when we update MMR)
        //can only do if we have existing cached data
        else if (result && Math.random() < 0.9)
        {
            if (player.insertMatch)
            {
                redis.hincrby(generateRedisKey(), 'games', 1);
                redis.hincrby(generateRedisKey(), 'wins', Number(isRadiant(player) === player.radiant_win));
            }
            if (player.solo_competitive_rank)
            {
                redis.hset(generateRedisKey(), 'solo_competitive_rank', player.solo_competitive_rank);
            }
            updateRank();
        }
        else
        {
            //db mode, lookup of current games, wins, mmr
            db.raw(`
            SELECT player_matches.account_id, hero_id, count(hero_id) as games, sum(case when ((player_slot < 64) = radiant_win) then 1 else 0 end) as wins, solo_competitive_rank
            FROM player_matches
            JOIN matches
            ON player_matches.match_id = matches.match_id
            JOIN player_ratings
            ON player_matches.account_id = player_ratings.account_id
            WHERE player_matches.account_id = ?
            AND hero_id = ?
            AND lobby_type = 7
            AND time = (SELECT max(time) FROM player_ratings WHERE account_id = player_matches.account_id)
            GROUP BY player_matches.account_id, hero_id, solo_competitive_rank;
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
                redis.hmset(generateRedisKey(), dbPlayer);
                updateRank();
            });
        }
    });

    function generateRedisKey()
    {
        return ['hero_rankings', 'meta', player.account_id, player.hero_id].join(':');
    }

    function updateRank()
    {
        redis.hgetall(generateRedisKey(), function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            console.log(result);
            player.games = Number(result.games);
            player.wins = Number(result.games);
            player.solo_competitive_rank = Number(result.solo_competitive_rank);
            //set minimum # of games to be ranked
            if (player.games > 0)
            {
                var score = computeScore(player);
                if (!isNaN(score))
                {
                    console.log(player.account_id, player.hero_id, score);
                    redis.zadd('hero_rankings:' + player.hero_id, score, player.account_id);
                }
            }
            cb();
        });
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