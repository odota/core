var moment = require('moment');
var config = require('./config');
var benchmarks = require('./benchmarks');
var async = require('async');
/**
 * Computes benchmarks for players in a match
 **/
function benchmarkMatch(redis, m, cb)
{
    async.map(m.players, function(p, cb)
    {
        p.benchmarks = {};
        async.eachSeries(Object.keys(benchmarks), function(metric, cb)
        {
            //in development use live data (for speed), in production use full data from last day (for consistency)
            var key = ['benchmarks', moment().subtract(config.NODE_ENV === "development" ? 0 : 1, 'hour').startOf('hour').format('X'), metric, p.hero_id].join(':');
            var raw = benchmarks[metric](m, p);
            p.benchmarks[metric] = {
                raw: raw
            };
            redis.zcard(key, function(err, card)
            {
                if (err)
                {
                    return cb(err);
                }
                console.log(raw)
                if (raw !== undefined && raw !== null && !Number.isNaN(raw))
                {
                    redis.zcount(key, '0', raw, function(err, count)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        var pct = count / card;
                        p.benchmarks[metric].pct = pct;
                        return cb(err);
                    });
                }
                else
                {
                    p.benchmarks[metric] = {};
                    cb();
                }
            });
        }, cb);
    }, cb);
}
module.exports = benchmarkMatch;