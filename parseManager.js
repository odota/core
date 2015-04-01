var processParse = require('./processParse');
var r = require('./redis');
var redis = r.client;
var jobs = r.jobs;
var cluster = require('cluster');
var config = require('./config');
var async = require('async');
var utility = require('./utility');
var getData = utility.getData;
start();

function start() {
    if (cluster.isMaster) {
        console.log("[PARSEMANAGER] starting master");
        var parsers = [];
        var ps = config.PARSER_HOST.split(",").map(function(p) {
            return "http://" + p + "?key=" + config.RETRIEVER_SECRET;
        });
        //build array from PARSER_HOST based on each worker's core count
        async.each(ps, function(url, cb) {
            getData(url, function(err, body) {
                if (err) {
                    return cb(err);
                }
                for (var i = 0; i < body.capacity; i++) {
                    parsers.push(url);
                }
                cb(err);
            });
        }, function(err) {
            /*
            redis.get("retrievers", function(err, result) {
                if (err || !result) {
                    console.log("no retrievers in redis!");
                    return start();
                }

                var parsers = JSON.parse(result);
            */
            if (err) {
                return start();
            }
            var urls = {};
            //length of this array is capacity
            var capacity = parsers.length;
            // Fork workers.
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
        });
    }
    else {
        console.log("[PARSEMANAGER] starting worker");
        process.send({
            id: cluster.worker.id,
            url: process.env.PARSER_URL
        });
        //insert into job the parser this worker should use
        jobs.process('request_parse', function(job, cb) {
            getParser(job, function() {
                processParse(job, cb);
            });
        });
        jobs.process('parse', function(job, cb) {
            getParser(job, function() {
                processParse(job, cb);
            });
        });
    }
}

function getParser(job, cb) {
        job.parser_url = process.env.PARSER_URL;
        cb();
    }
    /*
    function getParser(job, cb) {
        redis.get("retrievers", function(err, result) {
            if (err || !result) {
                console.log("no retrievers in redis!");
                return getParser(job, cb);
            }
            var parsers = JSON.parse(result);
            job.parser_url = parsers[Math.floor(Math.random() * parsers.length)];
            cb(err);
        });
    }
    */