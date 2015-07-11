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
            var urls = {};
            cluster.on('fork', function(worker) {
                worker.on('message', function(msg) {
                    console.log(msg);
                    //a new worker is running, keep track of what url it's using
                    urls[msg.pid] = msg.url;
                    console.log(urls);
                });
            });
            for (var i = 0; i < capacity; i++) {
                //fork a worker for each available parse core
                cluster.fork({
                    PARSER_URL: parsers[i]
                });
            }
            //TODO if we submitted a job with filename it must be parsed by localhost (on master)!
            cluster.on("exit", function(worker, code) {
                if (code !== 0) {
                    console.log("Worker crashed! Spawning a replacement of worker %s", worker.process.pid);
                    //give this new worker the parser url of the one that crashed
                    cluster.fork({
                        PARSER_URL: urls[worker.process.pid]
                    });
                }
            });
        }
        else {
            console.log("[PARSEMANAGER] starting worker with pid %s", process.pid);
            process.send({
                pid: process.pid,
                url: process.env.PARSER_URL
            });
            //process requests
            jobs.process('request_parse', function(job, cb) {
                getParserEnv(job, function() {
                    processParse(job, cb);
                });
            });
            //process regular parses
            jobs.process('parse', function(job, cb) {
                console.log("starting job: %s", job.id);
                getParserEnv(job, function() {
                    processParse(job, cb);
                });
            });
        }

        function getParserEnv(job, cb) {
            job.parser_url = process.env.PARSER_URL;
            cb();
        }

        function getParserRandom(job, cb) {
            job.parser_url = parsers[Math.floor(Math.random() * parsers.length)];
            cb();
        }
    });
}