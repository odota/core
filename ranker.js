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
    if (player.bootstrap)
    {
        //bootstrap mode, we have all the data in the job
        //redis.hmset(generateRedisKey(), player);
        console.log(player);
        if (player.solo_competitive_rank)
        {
            redis.zadd('solo_competitive_rank', player.solo_competitive_rank, player.account_id);
        }
        updateScore(player, cb);
    }
    //adjustable random factor to fallback to db for consistency check
    else if (Math.random() < 0.99)
    {
        //redis/incr mode
        /*
        if (player.insertMatch)
        {
            redis.hincrby(generateRedisKey(), 'games', 1);
            redis.hincrby(generateRedisKey(), 'wins', Number(isRadiant(player) === player.radiant_win));
        }
        */
        player.incr = true;
        updateScore(player, cb);
    }
    else
    {
        //db mode, lookup of current games, wins, mmr
        db.raw(`
            SELECT player_matches.account_id, hero_id, count(hero_id) as games, sum(case when ((player_slot < 64) = radiant_win) then 1 else 0 end) as wins
            FROM player_matches
            JOIN matches
            ON player_matches.match_id = matches.match_id
            WHERE player_matches.account_id = ?
            AND hero_id = ?
            AND lobby_type = 7
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
            //redis.hmset(generateRedisKey(), dbPlayer);
            updateScore(dbPlayer, cb);
        });
    }
}
rankQueue.on('completed', function(job)
{
    job.remove();
});
var POINTS_PER_WIN = 3;
var POINTS_PER_LOSS = 1;

function updateScore(player, cb)
{
    redis.zscore('solo_competitive_rank', player.account_id, function(err, score)
    {
        console.log(player, score);
        if (err)
        {
            return cb(err);
        }
        if (!score)
        {
            return cb();
        }
        if (player.incr)
        {
            redis.zincrby('hero_rankings:' + player.hero_id, (isRadiant(player) === player.radiant_win ? POINTS_PER_WIN : POINTS_PER_LOSS) * score, player.account_id);
        }
        else
        {
            redis.zadd('hero_rankings:' + player.hero_id, (player.wins * POINTS_PER_WIN + (player.games - player.wins) * POINTS_PER_LOSS) * score, player.account_id);
        }
        cb(err);
    });
}