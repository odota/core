var processParse = require('./processParse');
var processApi = require('./processApi');
var r = require('./redis');
var redis = r.client;
var jobs = r.jobs;
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var config = require('./config');
//wait to begin parsing to allow parsers to be put in redis
setTimeout(start, 5000);

function start() {
    redis.get("parsers", function(err, result) {
        if (err || !result) {
            console.log("no parsers in redis!");
            return setTimeout(start, 10000);
        }
        var parsers = JSON.parse(result);
        var capacity = parsers.length;
        if (cluster.isMaster) {
            console.log("[PARSEMANAGER] starting master");
            //process requests on master thread in order to avoid parse worker shutdowns affecting them
            jobs.process('request', 4, processApi);
            //process requests
            jobs.process('request_parse', 4, function(job, ctx, cb) {
                console.log("starting request_parse job: %s", job.id);
                getParserUrl(job, function() {
                    //pass an empty ctx since we don't want to shut down the master thread if the parse fails
                    processParse(job, null, cb);
                });
            });
            var urls = {};
            cluster.on('fork', function(worker) {
                worker.on('message', function(msg) {
                    console.log(msg);
                    //a new worker is running, keep track of what url it's using
                    urls[msg.pid] = msg.url;
                    console.log(urls);
                });
            });
            cluster.on("exit", function(worker, code) {
                console.log("Worker crashed! Spawning a replacement of worker %s", worker.process.pid);
                //give this new worker the parser url of the one that crashed
                cluster.fork({
                    PARSER_URL: urls[worker.process.pid]
                });
            });
            if (config.NODE_ENV !== "test") {
                for (var i = 0; i < capacity; i++) {
                    //fork a worker for each available parse core
                    cluster.fork({
                        PARSER_URL: parsers[i]
                    });
                }
            }
            else {
                runWorker();
            }
        }
        else {
            runWorker();
        }

        function runWorker() {
            console.log("[PARSEMANAGER] starting worker with pid %s", process.pid);
            if (process.send) {
                process.send({
                    pid: process.pid,
                    url: process.env.PARSER_URL
                });
            }
            //process regular parses
            jobs.process('parse', function(job, ctx, cb) {
                console.log("starting parse job: %s", job.id);
                getParserUrl(job, function() {
                    processParse(job, ctx, cb);
                });
            });
        }

        function getParserUrl(job, cb) {
            job.parser_url = process.env.PARSER_URL || parsers[Math.floor(Math.random() * parsers.length)];
            cb();
        }
    });
}