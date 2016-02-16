var constants = require('../constants');
var queue = require('../queue');
var addToQueue = queue.addToQueue;
var rQueue = queue.getQueue('rank');
var async = require('async');
var db = require('../db');
db.raw(`
SELECT pr.account_id, solo_competitive_rank from player_ratings pr
JOIN 
(select account_id, max(time) as maxtime from player_ratings GROUP by account_id) grouped
ON pr.account_id = grouped.account_id
AND pr.time = grouped.maxtime
`).asCallback(function(err, result)
{
    if (err){
        return exit(err);
    }
    async.eachSeries(result.rows, function(player, cb)
    {
        async.each(Object.keys(constants.heroes), function(hero_id, cb)
        {
            addToQueue(rQueue,
            {
                account_id: player.account_id,
                hero_id: hero_id,
                solo_competitive_rank: player.solo_competitive_rank
            },
            {}, cb);
        }, cb);
    }, exit);
});

function exit(err)
{
    process.exit(Number(err));
}