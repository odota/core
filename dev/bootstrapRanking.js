var constants = require('../constants');
var queue = require('../queue');
var addToQueue = queue.addToQueue;
var rQueue = queue.getQueue('rank');
var JSONStream = require('JSONStream');
var async = require('async');
var db = require('../db');
var args = process.argv.slice(2);
var start_id = Number(args[0]) || 0;
var stream = db.raw(`
SELECT pr.account_id, solo_competitive_rank from player_ratings pr
JOIN 
(select account_id, max(time) as maxtime from player_ratings GROUP by account_id) grouped
ON pr.account_id = grouped.account_id
AND pr.time = grouped.maxtime
WHERE pr.account_id > ?
AND solo_competitive_rank IS NOT NULL
`, [start_id]).stream();
stream.on('end', exit);
stream.pipe(JSONStream.parse());
stream.on('data', function(player)
{
    stream.pause();
    db.raw(`
    SELECT player_matches.account_id, hero_id, count(hero_id) as games, sum(case when ((player_slot < 64) = radiant_win) then 1 else 0 end) as wins
FROM player_matches
JOIN matches
ON player_matches.match_id = matches.match_id
WHERE lobby_type = 7
AND account_id = ?
GROUP BY account_id, hero_id
    `, [player.account_id]).asCallback(function(err, result)
    {
        if (err)
        {
            return exit(err);
        }
        async.each(result.rows, function(player2, cb)
        {
            player2.bootstrap = true;
            player2.solo_competitive_rank = player.solo_competitive_rank;
            addToQueue(rQueue, player2,
            {}, cb);
        }, function(err)
        {
            if (err)
            {
                return exit(err);
            }
            console.log(player.account_id);
            stream.resume();
        });
    });
});

function exit(err)
{
    if (err)
    {
        console.error(err);
    }
    process.exit(Number(err));
}