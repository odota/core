var processParse = require('./processParse');
var r = require('./redis');
var redis = r.client;
var jobs = r.jobs;
var kue = r.kue;
var utility = require('./utility');
var cluster = require('cluster');
var buildSets = require('./buildSets');
var config = require('./config');
start();

function start() {
    buildSets(function() {
        redis.get("parsers", function(err, result) {
            if (err || !result) {
                console.log('failed to get parsers from redis, retrying');
                return setTimeout(start, 10000);
            }
            var parsers = JSON.parse(result);
            //concurrent job processors per parse worker
            var parallelism = 4;
            var capacity = parsers.length * parallelism;
            if (cluster.isMaster && config.NODE_ENV !== "test") {
                console.log("[PARSEMANAGER] starting master");
                for (var i = 0; i < capacity; i++) {
                    if (false) {
                        //fork a worker for each available parse core
                        forkWorker(i);
                    }
                    else {
                        //run workers in parallel in a single thread (uses less memory)
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
                jobs.process('parse', function(job, ctx, cb) {
                    console.log("starting parse job: %s", job.id);
                    job.parser_url = getParserUrl(job);
                    //TODO check if the assigned url is healthy before trying to parse?
                    //if not, use ctx to pause
                    //keep checking status and resume the worker when the parse worker is alive again
                    //current behavior will just keep retrying the url
                    return processParse(job, ctx, cb);
                });
                utility.cleanup(jobs, kue, 'parse');

                function getParserUrl(job) {
                    return config.PARSER_URL || parsers[i] || parsers[Math.floor(Math.random() * parsers.length)];
                }
            }
        });
    });
}