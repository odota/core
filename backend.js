var utility = require('./utility');
var logger = utility.logger;
utility.clearActiveJobs('api', function(err) {
    if (err) {
        logger.info(err);
    }
    utility.jobs.process('api', utility.processApi);
});
utility.clearActiveJobs('upload', function(err) {
    if (err) {
        logger.info(err);
    }
    utility.jobs.process('upload', utility.processUpload);
});
utility.startScan();
setInterval(utility.untrackPlayers, 60 * 60 * 1000, function(err, num) {
    logger.info(err);
}); //check every hour