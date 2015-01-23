var utility = require('./utility')();
utility.clearActiveJobs('api', function(err) {
    if (err) {
        utility.logger.info(err);
    }
    utility.jobs.process('api', utility.processApiReq);
});
utility.clearActiveJobs('upload', function(err) {
    if (err) {
        utility.logger.info(err);
    }
    utility.jobs.process('upload', utility.processUpload);
});
utility.startScan();
setInterval(utility.untrackPlayers, 60 * 60 * 1000); //check every hour