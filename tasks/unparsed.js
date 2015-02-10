var db = require('../db');
var async = require('async');
var queueReq = require('../operations').queueReq;

module.exports = function unparsed(done) {
    db.matches.find({
        parse_status: 0
    }, function(err, docs) {
        if (err) {
            return done(err);
        }
        var i = 0;
        async.mapSeries(docs, function(match, cb) {
            queueReq("parse", match, function(err, job) {
                i += 1;
                console.log("[UNPARSED] match %s, jobid %s", match.match_id, job.id);
                cb(err);
            });
        }, function(err) {
            console.log("added %s matches to parse queue", i);
            done(err, i);
        });
    });
};