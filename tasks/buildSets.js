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
            redis.keys("visit:*", function(err, result) {
                var t = {};
                result.forEach(function(redis_key) {
                    var account_id = redis_key.split(":")[1];
                    t[account_id] = true;
                });
                //console.log(t);
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
                return cb(err, {
                    ratingPlayers: r,
                    bots: b,
                    retrievers: ps
                });
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
                cb(err, parser_urls);
            });
        }
    }, function(err, result) {
        if (err) {
            //TODO isolate failures of each set build
            console.log('error occured during buildSets: %s', err);
            return cb(err);
        }
        console.log('saving sets to redis');
        for (var key in result) {
            console.log(key, Boolean(result[key]));
            if (key === "retrievers") {
                var r = result.retrievers;
                console.log("r", Boolean(r.ratingPlayers), Boolean(r.bots), Boolean(r.retrievers));
                redis.set("ratingPlayers", JSON.stringify(r.ratingPlayers));
                redis.set("bots", JSON.stringify(r.bots));
                redis.set("retrievers", JSON.stringify(r.retrievers));
            }
            else {
                if (key === "trackedPlayers") {
                    //add donators to set
                    for (var key in result.donators) {
                        result.trackedPlayers[key] = true;
                    }
                }
                redis.set(key, JSON.stringify(result[key]));
            }
        }
        console.log('set build complete');
        return cb(err);
    });
};