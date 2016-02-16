var queue = require('./queue');
var rankQueue = queue.getQueue('rank');
var db = require('./db');
var redis = require('./redis');
var queries = require('./queries');
rankQueue.process(10, processRank);

function processRank(job, cb)
{
    //lookup of current games, wins, solo_competitive_rank for this player
    db.raw(`
    SELECT account_id, hero_id, count(hero_id) as games, sum(case when ((player_slot < 64) = radiant_win) then 1 else 0 end) as wins
    FROM player_matches
    JOIN matches
    ON player_matches.match_id = matches.match_id
    WHERE account_id = ?
    AND hero_id = ?
    AND lobby_type = 7
    GROUP BY player_matches.account_id, hero_id;
    `, [job.data.payload.account_id, job.data.payload.hero_id]).asCallback(function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        if (!result.rows || !result.rows[0])
        {
            return cb("no players found");
        }
        var player = result.rows[0];
        player.solo_competitive_rank = job.data.payload.solo_competitive_rank;
        //set minimum # of games to be ranked
        if (player.games < 1)
        {
            return cb();
        }
        else
        {
            var score = computeScore(player);
            if (!isNaN(score))
            {
                console.log(player.account_id, player.hero_id, score);
                redis.zadd('hero_rankings:' + player.hero_id, score, player.account_id);
            }
            cb();
        }
    });
    //TODO may be more performant to cache the counts somewhere and only do the expensive query for consistency check--use direct update query most of the time?
    //`UPDATE hero_rankings SET games = games + 1, wins = wins + ?, solo_competitive_rank = ?
}
rankQueue.on('completed', function(job)
{
    job.remove();
});

function computeScore(player)
{
    return player.games * (player.wins / (player.games - player.wins + 1)) * player.solo_competitive_rank;
}