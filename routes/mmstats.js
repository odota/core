var express = require('express');
var mmstats = express.Router();
var constants = require('../constants');
var async = require('async');
module.exports = function(redis) {
    var pageCalls = createCalls(-1);
    var apiCalls = createCalls(0);
    mmstats.route('/mmstats').get(function(req, res, next) {
        async.parallel(pageCalls, function(err, result) {
            if (err) return next(err);
            res.render("mmstats", {
                result: result,
            });
        });
    });
    mmstats.route('/mmstats/api').get(function(req, res, next) {
        async.parallel(apiCalls, function(err, result) {
            if (err) return next(err);
            res.json(result);
        });
    });
    return mmstats;

    function createCalls(range) {
        var calls = {};
        for (var i = 0; i < Object.keys(constants.regions).length; i++) {
            var regionName;
            for (var region in constants.regions) {
                if (constants.regions[region]["matchgroup"] === i + "") {
                    regionName = region;
                    break;
                }
            }
            calls[regionName ? regionName : i] = createCall(i, range);
        }
        calls["x"] = function(cb) {
            redis.lrange("mmstats:time", 0, range, cb);
        };
        return calls;
    }

    function createCall(i, range) {
        return function(cb) {
            redis.lrange("mmstats:" + i, 0, range, cb);
        };
    }
};
