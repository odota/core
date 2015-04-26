var processParse = require('./processParse');
var r = require('./redis');
var redis = r.client;
var jobs = r.jobs;
var cluster = require('cluster');
start();

function start() {
    if (cluster.isMaster) {
        console.log("[PARSEMANAGER] starting master");
            redis.get("parsers", function(err, result) {
                if (err || !result) {
                    console.log("no parsers in redis!");
                    return setTimeout(function() {
                        return start();
                    }, 10000);
                }
                var parsers = JSON.parse(result);
                //length of this array is capacity
                var capacity = parsers.length;
                //run one job.process for requests
                jobs.process('request_parse', function(job, cb) {
                    job.parser_url = parsers[0];
                    processParse(job, cb);
                });
                //run one jobs.process with parallelism=capacity
                jobs.process('parse', capacity, function(job, cb) {
                    //RR or randomly select a parser for each job
                    getParserRandom(job, function() {
                        processParse(job, cb);
                    });
                });
                /*
                var urls = {};
                // code to spawn a thread for each parsing core
                for (var i = 0; i < capacity; i++) {
                    cluster.fork({
                        PARSER_URL: parsers[i]
                    });
                }
                // handle unwanted worker exits
                cluster.on("exit", function(worker, code) {
                    if (code != 0) {
                        console.log("Worker crashed! Spawning a replacement.");
                        //fork a new worker with the same url as the one that crashed
                        //lookup by worker id
                        cluster.fork({
                            PARSER_URL: urls[worker.id]
                        });
                    }
                });
                Object.keys(cluster.workers).forEach(function(id) {
                    cluster.workers[id].on('message', function(msg) {
                        console.log(msg);
                        //a new worker is running, keep track of what url it's using
                        urls[msg.id] = msg.url;
                    });
                });
                */
            });
    }
    else {
        /*
        console.log("[PARSEMANAGER] starting worker");
        process.send({
            id: cluster.worker.id,
            url: process.env.PARSER_URL
        });
        //insert into job the parser this worker should use
        jobs.process('parse', function(job, cb) {
            getParserEnv(job, function() {
                processParse(job, cb);
            });
        });
function getParserEnv(job, cb) {
    job.parser_url = process.env.PARSER_URL;
    cb();
}
*/
    }
}

function getParserRandom(job, cb) {
    redis.get("parsers", function(err, result) {
        if (err || !result) {
            console.log("no parsers in redis!");
            return getParserRandom(job, cb);
        }
        var parsers = JSON.parse(result);
        job.parser_url = parsers[Math.floor(Math.random() * parsers.length)];
        cb();
    });
}
