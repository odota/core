var utility = require('./utility');
var jobs = utility.jobs;
var logger = utility.logger;
utility.clearActiveJobs('parse', function(err) {
    if (err) {
        logger.info(err);
    }
    jobs.process('parse', utility.processParse);
});