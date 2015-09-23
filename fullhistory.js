var processFullHistory = require('./processFullHistory');
var utility = require('./utility');
var r = require('./redis');
var jobs = r.jobs;
var kue = r.kue;
var cluster = require('cluster');
var config = require('./config');
var steam_hosts = config.STEAM_API_HOST.split(",");
if (cluster.isMaster && config.NODE_ENV !== "test") {
    console.log("[FULLHISTORY] starting master");
    utility.cleanup(jobs, kue, "fullhistory");
    for (var i = 0; i < steam_hosts.length; i++) {
        if (true) {
            cluster.fork();
        }
        else {
            runWorker();
        }
    }
    cluster.on('exit', function(worker, code, signal) {
        cluster.fork();
    });
}
else {
    runWorker();
}

function runWorker() {
    jobs.process('fullhistory', processFullHistory);
}