var queue = require('./queue');
var playerCache = require('./playerCache');
var updateCache = playerCache.updateCache;
queue.cache.process(1, processCache);
queue.cache.on('completed', function(job){
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
