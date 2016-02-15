var queue = require('./queue');
var rankQueue = queue.getQueue('rank');
rankQueue.process(1, processRank);

function processRank(job, cb)
{
    //occasionally consistency check via lookup of current games, wins, solo_competitive_rank for this player
    //otherwise update with account id, hero id, games+1, wins+1(player_slot, radiant_win)?, solo_competitive_rank, recompute score?
}
rankQueue.on('completed', function(job)
{
    job.remove();
});
