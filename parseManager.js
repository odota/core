var processParse = require('./processParse');
var r = require('./redis');
var redis = r.client;
var jobs = r.jobs;
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var config = require('./config');
var buildSets = require('./buildSets');
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
                //TODO check if the assigned url is active
                //if not, use ctx to pause and cb(err) (this consumes a retry)
                //keep checking status and resume the worker when the parse worker is alive again
                return processParse(job, ctx, cb);
            });

            function getParserUrl(job) {
                //node <0.12 doesn't have RR cluster scheduling, so parsing on remote workers may cause us to lose a request if the remote is crashed by another job using the same core/thread
                //can process parse requests on localhost to avoid issue
                /*
                if (job.data.payload.request) {
                    return job.parser_url = "http://localhost:5200?key=" + config.RETRIEVER_SECRET;
                }
                */
                return config.PARSER_URL || parsers[i] || parsers[Math.floor(Math.random() * parsers.length)];
            }
        }
    });
}