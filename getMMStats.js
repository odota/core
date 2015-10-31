var utility = require('./utility');
var config = require("./config");
var getData = utility.getData;
var DATA_POINTS = 60 / (config.MMSTATS_DATA_INTERVAL || 1) * 24; //Store 24 hours worth of data
module.exports = function getMMStats(redis, cb) {
    redis.get("retrievers", function(err, result) {
        if (err || !result) {
            console.log("failed to get retrievers from redis");
        }
        else {
            result = JSON.parse(result);
            //make array of retriever urls and use a random one on each retry
            var urls = result.map(function(r) {
                return r + "&mmstats=1";
            });
            getData(urls, function(err, body) {
                if (err) return cb(err);
                redis.lpush("mmstats:time", Date.now());
                redis.ltrim("mmstats:time", 0, DATA_POINTS);
                body.forEach(function(elem, index) {
                    redis.lpush('mmstats:' + index, elem);
                    redis.ltrim('mmstats:' + index, 0, DATA_POINTS);
                });
                cb(err);
            });
        }
    });
}