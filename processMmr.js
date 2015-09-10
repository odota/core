var utility = require('./utility');
var db = require('./db');
var logger = utility.logger;
var getData = utility.getData;
module.exports = function processMmr(job, cb) {
    var payload = job.data.payload;
    getData({
        url: job.data.url,
        noRetry: true
    }, function(err, data) {
        if (err) {
            logger.info(err);
            //don't clutter kue with failed mmr reqs
            //if any error occurs (including retriever down) we simply skip getting MMR for this match
            return cb(null, err);
        }
        logger.info("mmr response");
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