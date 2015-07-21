var db = require('../db');
var async = require('async');
var queueReq = require('../operations').queueReq;
var moment = require('moment');
module.exports = function unparsed(done) {
    db.matches.find({
        "start_time": {
            $gt: moment().subtract(7, 'days').format('X')
        },
        "parse_status": 0
    }, function(err, docs) {
        if (err) {
            return done(err);
        }
        async.eachSeries(docs, function(match, cb) {
            queueReq("api_details", match, function(err, job) {
                console.log("[UNPARSED] match %s, jobid %s", match.match_id, job.id);
                cb(err);
            });
        }, function(err) {
            console.log(docs.length);
            done(err, docs.length);
        });
    });
};