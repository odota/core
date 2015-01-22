if (process.env.RETRIEVER) {
    require('./retriever');
}
else {
    var app = require('./app');
    var utility = require('./utility')();
    var server = app.listen(process.env.PORT || 3000, function() {
        var host = server.address().address;
        var port = server.address().port;
        console.log('[WEB] listening at http://%s:%s', host, port);
    });
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
}