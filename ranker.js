var queue = require('./queue');
var rankQueue = queue.getQueue('rank');
var db = require('./db');
var queries = require('./queries');
rankQueue.process(1, processRank);

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
        queries.upsert(db, 'hero_rankings', player,
        {
            account_id: player.account_id,
            hero_id: player.hero_id
        }, cb);
    });
    //TODO may be more performant to do the table for consistency check and use direct update query most of the time?  This requires triggering a job on every ranked match.
    //`INSERT INTO hero_rankings(account_id, hero_id, games, wins, solo_competitive_rank) VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id, hero_id) DO UPDATE SET games = games + 1, wins = wins + ?, solo_competitive_rank = ?
}
rankQueue.on('completed', function(job)
{
    job.remove();
});