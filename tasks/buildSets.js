var async = require('async');
var db = require('../db');
var config = require('../config');
var r = require('../redis');
var utility = require('../utility');
var getData = utility.getData;
var selector = require('../selector');
var redis = r.client;
var retrievers = config.RETRIEVER_HOST;

module.exports = function buildSets(cb) {
        console.log("rebuilding sets");
        async.series({
            "trackedPlayers": function(cb) {
                db.players.find(selector("tracked"), function(err, docs) {
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
            "userPlayers": function(cb) {
                db.players.find({
                    last_visited: {
                        $ne: null
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
            "parsers": function(cb) {
                var parsers = [];
                var ps = config.PARSER_HOST.split(",").map(function(p) {
                    return "http://" + p + "?key=" + config.RETRIEVER_SECRET;
                });
                //build array from PARSER_HOST based on each worker's core count
                async.each(ps, function(url, cb) {
                    getData(url, function(err, body) {
                        if (err) {
                            return cb(err);
                        }
                        for (var i = 0; i < body.capacity; i++) {
                            parsers.push(url);
                        }
                        cb(err);
                    });
                }, function(err) {
                    cb(err, parsers);
                });
            },
            "retrievers": function(cb) {
                var r = {};
                var b = [];
                var ps = retrievers.split(",").map(function(r) {
                    return "http://" + r + "?key=" + config.RETRIEVER_SECRET;
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
                    var result = {
                        ratingPlayers: r,
                        bots: b,
                        retrievers: ps
                    };
                    cb(err, result);
                });
            }
        }, function(err, result) {
            if (err) {
                return buildSets(cb);
            }
            //separate out retriever data into separate keys
            result.ratingPlayers = result.retrievers.ratingPlayers;
            result.bots = result.retrievers.bots;
            result.retrievers = result.retrievers.retrievers;
            for (var key in result) {
                redis.set(key, JSON.stringify(result[key]));
            }
            cb();
        });
    };