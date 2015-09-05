var r = require('../redis');
var async = require('async');
var kue = r.kue;
var jobs = r.jobs;
module.exports = function(cb) {
    jobs.failed(function(err, ids) {
        if (err) {
            return cb(err);
        }
        async.eachSeries(ids, function(id, cb) {
            kue.Job.get(id, function(err, job) {
                if (err) {
                    return cb(err);
                }
                else {
                    job.remove(function(err) {
                        console.log('removed ', job.id);
                        return cb(err);
                    });
                }
            });
        }, function(err) {
            return cb(err);
        });
    });
};