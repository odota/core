var processFullHistory = require('./processFullHistory');
var r = require('./redis');
var jobs = r.jobs;
var cluster = require('cluster');
var config = require('./config');
var steam_hosts = config.STEAM_API_HOST.split(",");
if (cluster.isMaster && config.NODE_ENV !== "test") {
    console.log("[FULLHISTORY] starting master");
    for (var i = 0; i < steam_hosts.length; i++) {
        cluster.fork();
    }
    cluster.on('exit', function(worker, code, signal) {
        cluster.fork();
    });
}
else {
    jobs.process('fullhistory', processFullHistory);
}
