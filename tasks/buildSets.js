var async = require('async');
var db = require('../db');
var r = require('../redis');
var redis = r.client;
var moment = require('moment');
var config = require('../config');
var utility = require('../utility');
var getData = utility.getData;
var retrievers = config.RETRIEVER_HOST;
var parsers = config.PARSER_HOST;
var secret = config.RETRIEVER_SECRET;
module.exports = function buildSets(cb) {
    console.log("rebuilding sets");
    async.parallel({
        "trackedPlayers": function(cb) {
            db.players.find({
                last_visited: {
                    $gt: moment().subtract(config.UNTRACK_DAYS, 'day').toDate()
                }
            }, {
                fields: {
                    "account_id": 1
                }
            }, function(err, docs) {
                if (err) {
                    return cb(err);
                }
                var t = {};
                docs.forEach(function(player) {
                    t[player.account_id] = true;
                });
                //console.log(t);
                redis.set("trackedPlayers", JSON.stringify(t));
                cb(err, t);
            });
        },
        "userPlayers": function(cb) {
            db.players.find({
                last_visited: {
                    $ne: null
                }
            }, {
                fields: {
                    "account_id": 1
                }
            }, function(err, docs) {
                if (err) {
                    return cb(err);
                }
                var t = {};
                docs.forEach(function(player) {
                    t[player.account_id] = true;
                });
                //console.log(t);
                redis.set("userPlayers", JSON.stringify(t));
                cb(err, t);
            });
        },
        "donators": function(cb) {
            db.players.find({
                cheese: {
                    $gt: 0
                }
            }, {
                fields: {
                    "account_id": 1
                }
            }, function(err, docs) {
                if (err) {
                    return cb(err);
                }
                var t = {};
                docs.forEach(function(player) {
                    t[player.account_id] = true;
                });
                //console.log(t);
                redis.set("donators", JSON.stringify(t));
                cb(err, t);
            });
        },
        "retrievers": function getRetrievers(cb) {
            var r = {};
            var b = [];
            var ps = retrievers.split(",").map(function(r) {
                return "http://" + r + "?key=" + secret;
            });
            async.each(ps, function(url, cb) {
                getData(url, function(err, body) {
                    if (err) {
                        return cb(err);
                    }
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
                redis.set("retrievers", JSON.stringify(ps));
                cb(err);
            });
        },
        "parsers": function getParsers(cb) {
            var parser_urls = [];
            var ps = parsers.split(",").map(function(p) {
                return "http://" + p + "?key=" + secret;
            });
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
        }
    }, function(err, result) {
        if (err) {
            console.log('error occured during buildSets: %s', err);
        }
        //merge trackedPlayers with donators, resave to redis
        for (var key in result.donators) {
            result.trackedPlayers[key] = true;
        }
        redis.set("trackedPlayers", JSON.stringify(result.trackedPlayers));
        return cb(err);
    });
};