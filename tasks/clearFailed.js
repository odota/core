var r = require('../redis');
var async = require('async');
var kue = r.kue;
var queue = r.queue;
module.exports = function(cb) {
    queue.failed(function(err, ids) {
        if (err) {
            return cb(err);
        }
        async.eachSeries(ids, function(id, cb) {
            kue.Job.get(id, function(err, job) {
                if (err || !job) {
                    console.log(err);
                    return cb();
                }
                job.remove(function(err) {
                    console.log('removed ', job.id);
                    return cb(err);
                });
            });
        }, function(err) {
            return cb(err);
        });
    });
};
