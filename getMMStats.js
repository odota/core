var db = require('./db');
var r = require('./redis');
var redis = r.client;
var utility = require('./utility');
var getData = utility.getData;
module.exports = function getMMStats() {
    redis.get("retrievers", function(err, result) {
        if (err || !result) {
            console.log("failed to get retrievers from redis");
        } else {
            result = JSON.parse(result);
            //make array of retriever urls and use a random one on each retry
            var urls = result.map(function(r) {
                return r + "&mmstats=1";
            });
            utility.getData(urls, function(err, body) {
                if (err) console.log("man")
                console.log(Date.now());
                console.log(body);
            });
        }
    });
}