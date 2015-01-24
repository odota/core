var utility = require('./utility');
utility.clearActiveJobs('parse', function(err) {
    if (err) {
        utility.logger.info(err);
    }
    utility.jobs.process('parse', process.env.STREAM ? utility.processParse : utility.processParseStream);
});