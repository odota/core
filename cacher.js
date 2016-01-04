var queue = require('./queue');
var playerCache = require('./playerCache');
var updateCache = playerCache.updateCache;
queue.cache.process(1, processCache);

function processCache(job, cb)
{
    console.log('match: %s, account: %s', job.payload.match_id, job.payload.account_id);
    updateCache(job.payload, function(err)
    {
        if (err)
        {
            console.error(err);
        }
        return cb(err);
    });
}
