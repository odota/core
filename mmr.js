var utility = require('./utility');
var queue = require('./queue');
var db = require('./db');
var getData = utility.getData;
var queries = require('./queries');
queue.process('mmr', 10, processMmr);
utility.cleanup(queue, "mmr");

function processMmr(job, cb) {
    getData({
        url: job.data.url,
        noRetry: true
    }, function(err, data) {
        if (err) {
            console.error(err);
            //don't clutter kue with failed mmr reqs
            //if any error occurs (including retriever down) we simply skip getting MMR for this match
            return cb(null, err);
        }
        if (data.solo_competitive_rank || data.competitive_rank) {
            data.match_id = job.data.payload.match_id;
            data.time = new Date();
            queries.insertPlayerRating(db, data, cb);
        }
        else {
            cb(null);
        }
    });
}