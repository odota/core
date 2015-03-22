var processors = require('./processors');
var jobs = require('./redis').jobs;
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
if (cluster.isMaster) {
    console.log("[PARSER] starting parser master");
    jobs.process('request_parse', processors.processParse);
    // Fork workers.
    for (var i = 0; i < 1; i++) {
        cluster.fork();
    }
    cluster.on('death', function(worker) {
        console.log('worker ' + worker.pid + ' died');
    });
}
else {
    console.log("[PARSER] starting parser worker");
    jobs.process('parse', 6, processors.processParse);
}
