var r = require('../redis');
var kue = r.kue;
var jobs = r.jobs;
jobs.failed(function(err, ids) {
    ids.forEach(function(id) {
        kue.Job.get(id, function(err, job) {
            if (err) {
                console.log(err);
            }
            else {
                job.remove(function() {
                    console.log('removed ', job.id);
                });
            }
        });
    });
});