var async = require('async');
module.exports = function getMatchRating(redis, match, cb)
{
    async.map(match.players, function(player, cb)
    {
        if (!player.account_id)
        {
            return cb();
        }
        redis.zscore('solo_competitive_rank', player.account_id, cb);
    }, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        var filt = result.filter(function(r)
        {
            return r;
        });
        var avg = ~~(filt.map(function(r)
        {
            return Number(r);
        }).reduce(function(a, b)
        {
            return a + b;
        }, 0) / filt.length);
        cb(err, avg);
    });
};