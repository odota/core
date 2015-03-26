var processParse = require('./processParse');
var jobs = require('./redis').jobs;
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
if (cluster.isMaster) {
    console.log("[PARSER] starting parser master");
    jobs.process('request_parse', processParse);
    // Fork workers.
    for (var i = 0; i < 1; i++) {
        cluster.fork();
    }
    cluster.on('death', function(worker) {
        //todo respawn a worker?
        console.log('worker ' + worker.pid + ' died');
    });
}
else {
    console.log("[PARSER] starting parser worker");
    jobs.process('parse', numCPUs, processParse);
}