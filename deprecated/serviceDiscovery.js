var utility = require('./utility');
var getData = utility.getData;
var async = require('async');
//get list of parsers/retrievers from redis/service discovery (currently redis)
//visit each to pick up remote data such as bots, rating players, parser capacity and write that data to redis
function queryRetrievers(redis, cb) {
    var r = {};
    var b = [];
    redis.get("retrievers", function(err, ps) {
        if (err || !ps) {
            return cb(err);
        }
        ps = JSON.parse(ps);
        async.each(ps, function(url, cb) {
            getData(url, function(err, body) {
                if (err) {
                    return cb(err);
                }
                
                if (!body.ready) return cb("retriever isn't ready");
                
                for (var key in body.accounts) {
                    b.push(body.accounts[key]);
                }
                for (var key in body.accountToIdx) {
                    r[key] = url + "&account_id=" + key;
                }
                cb(err);
            });
        }, function(err) {
            if (err) {
                return cb(err);
            }
            redis.set("ratingPlayers", JSON.stringify(r));
            redis.set("bots", JSON.stringify(b));
            return cb(err);
        });
    });
}

function queryParsers(redis, cb) {
    var parser_urls = [];
    redis.get("parsers", function(err, ps) {
        if (err || !ps) {
            return cb(err);
        }
        ps = JSON.parse(ps);
        //build array from PARSER_HOST based on each worker's core count
        async.each(ps, function(url, cb) {
            getData(url, function(err, body) {
                if (err) {
                    return cb(err);
                }
                for (var i = 0; i < body.capacity; i++) {
                    parser_urls.push(url);
                }
                cb(err);
            });
        }, function(err) {
            redis.set("parsers", JSON.stringify(parser_urls));
            cb(err);
        });
    });
}

module.exports = {
    queryRetrievers: queryRetrievers,
    queryParsers: queryParsers
};
