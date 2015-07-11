var utility = require('./utility');
var async = require('async');
var logger = utility.logger;
var getData = utility.getData;
var operations = require('./operations');
var insertPlayer = operations.insertPlayer;
var insertMatch = operations.insertMatch;
var insertMatchProgress = operations.insertMatchProgress;
module.exports = function processApi(job, cb) {
    var payload = job.data.payload;
    job.progress(0, 100, "Getting basic match data from Steam API...");
    getData(job.data.url, function(err, body) {
        if (err) {
            //couldn't get data from api, non-retryable
            return cb(JSON.stringify(err));
        }
        else if (body.response) {
            logger.info("summaries response");
            async.mapSeries(body.response.players, insertPlayer, function(err) {
                cb(err, body.response.players);
            });
        }
        else if (payload.match_id) {
            logger.info("details response");
            var match = body.result;
            //join payload with match
            for (var prop in payload) {
                match[prop] = (prop in match) ? match[prop] : payload[prop];
            }
            job.progress(100, 100, "Received basic match data.");
            if (match.request) {
                insertMatchProgress(match, job, function(err) {
                    cb(err);
                });
            }
            else {
                insertMatch(match, function(err) {
                    cb(err);
                });
            }
        }
        else {
            return cb("unknown response");
        }
    });
};
