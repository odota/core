var processMmr = require('./processMmr');
var utility = require('./utility');
var r = require('./redis');
var kue = r.kue;
var queue = r.queue;
var db = require('./db');
var getData = utility.getData;
queue.process('mmr', 10, processMmr);
utility.cleanup(queue, kue, "mmr");

function processMmr(job, cb) {
    var payload = job.data.payload;
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
            db.players.update({
                account_id: payload.account_id
            }, {
                $push: {
                    ratings: {
                        match_id: payload.match_id,
                        account_id: payload.account_id,
                        soloCompetitiveRank: data.solo_competitive_rank,
                        competitiveRank: data.competitive_rank,
                        time: new Date()
                    }
                }
            }, function(err) {
                cb(err);
            });
        }
        else {
            cb(null);
        }
    });
}