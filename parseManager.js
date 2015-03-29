var processParse = require('./processParse');
var jobs = require('./redis').jobs;
var cluster = require('cluster');
var config = require('./config');
//var capacity = require('os').cpus().length;
if (cluster.isMaster) {
    console.log("[PARSER] starting parser master");
    jobs.process('request_parse', processParse);
    var ps = config.PARSER_HOST.split(",");
    var urls = {};
    var parsers = [];
    var power = 2;
    //build array from PARSER_HOST based on each worker's power
    ps.forEach(function(p) {
        for (var i = 0; i < power.length; i++) {
            parsers.push(p);
        }
    });
    //length of this array is capacity
    var capacity = parsers.length;
    // Fork workers.
    for (var i = 0; i < capacity; i++) {
        //give each worker its own parser_host
        cluster.fork({
            parser_host: parsers[0]
        });
    }
    // handle unwanted worker exits
    cluster.on("exit", function(worker, code) {
        if (code != 0) {
            console.log("Worker crashed! Spawning a replacement.");
            //fork a new worker with the same parser_host as the one that crashed
            //lookup by worker id
            cluster.fork({
                parser_host: urls[worker.id]
            });
        }
    });
    Object.keys(cluster.workers).forEach(function(id) {
        cluster.workers[id].on('message', function(msg) {
            console.log(msg);
            //a new worker is running, keep track of what parser_host it's using
            urls[msg.id] = msg.url;
        });
    });
}
else {
    console.log("[PARSER] starting parser worker");
    process.send({
        id: cluster.worker.id,
        url: process.env.parser_host
    });
    //insert into job the parser_host this worker should use, from process.env.parser_host
    jobs.process('parse', function(job, cb) {
        job.parser_host = process.env.parser_host;
        processParse(job, cb);
    });
}