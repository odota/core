var queue = require('./queue');
var playerCache = require('./playerCache');
var updateCache = playerCache.updateCache;
queue.cache.process(1, processCache);

function processCache(job, cb)
{
    console.log('match: %s, account: %s', job.data.payload.match_id, job.data.payload.account_id);
    updateCache(job.data.payload, function(err)
    {
        if (err)
        {
            console.error(err);
        }
        return cb(err);
    });
}
