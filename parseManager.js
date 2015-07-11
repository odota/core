var processParse = require('./processParse');
var r = require('./redis');
var redis = r.client;
var jobs = r.jobs;
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var config = require('./config');
start();

function start() {
    redis.get("parsers", function(err, result) {
        if (err || !result) {
            console.log("no parsers in redis!");
            return setTimeout(start, 10000);
        }
        var parsers = JSON.parse(result);
        var capacity = parsers.length;
        if (cluster.isMaster && config.NODE_ENV !== "test") {
            console.log("[PARSEMANAGER] starting master");
            for (var i = 0; i < capacity; i++) {
                cluster.fork();
            }
            cluster.on("exit", function(worker, code) {
                if (code !== 0) {
                    console.log("Worker crashed! Spawning a replacement.");
                    cluster.fork();
                }
            });
        }
        else {
            console.log("[PARSEMANAGER] starting worker");
            //process requests
            //TODO if we submitted a job via kue (with filename) it must be parsed by localhost!
            jobs.process('request_parse', function(job, cb) {
                job.parser_url = parsers[0];
                processParse(job, cb);
            });
            //process regular parses
            jobs.process('parse', function(job, cb) {
                console.log("starting job: %s", job.id);
                //RR or randomly select a parser for each job
                getParserRandom(job, function() {
                    processParse(job, cb);
                });
            });
        }

        function getParserRandom(job, cb) {
            //TODO enable retrieving latest parser list at selection time
            //TODO restrict each worker to use a specific parser url to prevent collision
            job.parser_url = parsers[Math.floor(Math.random() * parsers.length)];
            cb();
        }
    });
}
