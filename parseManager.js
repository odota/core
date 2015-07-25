var processParse = require('./processParse');
var processApi = require('./processApi');
var r = require('./redis');
var redis = r.client;
var jobs = r.jobs;
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var config = require('./config');
var buildSets = require('./tasks/buildSets');
var parsers;
if (config.NODE_ENV !== "test" && cluster.isMaster) {
    buildSets(function() {
        start();
    });
}
else {
    start();
}

function start() {
    redis.get("parsers", function(err, result) {
        if (err || !result) {
            console.log('failed to get parsers from redis, retrying');
            return setTimeout(start, 10000);
        }
        parsers = JSON.parse(result);
        var capacity = parsers.length;
        if (cluster.isMaster) {
            console.log("[PARSEMANAGER] starting master");
            jobs.process('request', numCPUs, processApi);
            for (var i = 0; i < capacity; i++) {
                if (config.NODE_ENV !== "test" && false) {
                    //fork a worker for each available parse core
                    forkWorker(i);
                }
                else {
                    //run a job in parallel in a single thread for each parse core (saves more memory)
                    runWorker(i);
                }
            }
        }
        else {
            runWorker(0);
        }

        function forkWorker(i) {
            var worker = cluster.fork({
                PARSER_URL: parsers[i]
            });
            worker.on("exit", function() {
                console.log("Worker crashed! Spawning a replacement of worker %s", worker.id);
                forkWorker(i);
            });
        }

        function runWorker(i) {
            console.log("[PARSEMANAGER] starting worker with pid %s", process.pid);
            //process parses
            jobs.process('parse', function(job, ctx, cb) {
                console.log("starting parse job: %s", job.id);
                getParserUrl(job, i, function() {
                    processParse(job, null, cb);
                });
            });

            function getParserUrl(job, i, cb) {
                //TODO currently we run all the processparse with parallelism determined at start time
                //we should have the ability to detect failing parse workers and not use them/adjust parallelism
                job.parser_url = process.env.PARSER_URL || parsers[i] || parsers[Math.floor(Math.random() * parsers.length)];
                //node <0.12 doesn't have RR cluster scheduling, so remote parse worker crashes may cause us to lose a request.
                //process parse requests on localhost to avoid issue
                if (job.data.payload.request) {
                    job.parser_url = "http://localhost:5200?key=" + config.RETRIEVER_SECRET;
                }
                cb();
            }
        }
    });
}