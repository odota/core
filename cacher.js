var queue = require('./queue');
var cQueue = queue.getQueue('cache');
var playerCache = require('./playerCache');
var updateCache = playerCache.updateCache;
cQueue.process(1, processCache);
cQueue.on('completed', function(job){
    job.remove();
});
function processCache(job, cb)
{
    console.log('match: %s', job.data.payload.match_id);
    updateCache(job.data.payload, function(err)
    {
        if (err)
        {
            console.error(err);
        }
        return cb(err);
    });
}
