var utility = require('./utility');
var db = require('./db');
var logger = utility.logger;
var getData = utility.getData;
module.exports = function processMmr(job, cb) {
    var payload = job.data.payload;
    getData(job.data.url, function(err, data) {
        if (err) {
            logger.info(err);
            //don't clutter kue with failed mmr reqs
            //if any error occurs (including retriever down) we simply skip getting MMR for this match
            return cb(null, err);
        }
        logger.info("mmr response");
        if (data.soloCompetitiveRank || data.competitiveRank) {
            db.players.update({
                account_id: payload.account_id
            }, {
                 $push: {
                    ratings:{
                        match_id: payload.match_id,
                        account_id: payload.account_id,
                        soloCompetitiveRank: data.soloCompetitiveRank,
                        competitiveRank: data.competitiveRank,
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