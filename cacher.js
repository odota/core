var queue = require('./queue');
var playerCache = require('./playerCache');
var updateCache = playerCache.updateCache;
queue.cache.process(1, processCache);

function processCache(job, cb) {
    updateCache(job.payload, cb);
}
