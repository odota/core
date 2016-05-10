/**
 * Queue an account_id for fullhistory
 **/
var queue = require('../queue');
var fhQueue = queue.getQueue('fullhistory');
var player = {
    account_id: Number(process.argv[2])
};
queue.addToQueue(fhQueue, player,
{
    attempts: 1
}, function(err, job)
{
    if (err)
    {
        console.error(err);
    }
    process.exit(err ? 1 : 0);
});