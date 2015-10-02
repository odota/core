var db = require('../db');
var async = require('async');
var insertMatch = require('../operations').insertMatch;
var moment = require('moment');

db.matches.find({
    "start_time": {
        $gt: moment().subtract(1, 'days').format('X')
    },
    "parse_status": 0
}, function(err, docs) {
    if (err) {
        return;
    }
    async.eachSeries(docs, function(match, cb) {
        insertMatch(match, function(err, job) {
            console.log("[UNPARSED] match %s, jobid %s", match.match_id, job.id);
            cb(err);
        });
    }, function(err) {
        console.log(docs.length);
    });
});
