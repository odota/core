var redis = require('./redis');
var queue = require('./queue');
var utility = require('./utility');
var cluster = require('cluster');
var buildSets = require('./buildSets');
var config = require('./config');
var getReplayUrl = require('./getReplayUrl');
var request = require('request');
var moment = require('moment');
var db = require('./db');
var insertMatch = require('./queries').insertMatch;
start();

function start() {
    buildSets(db, redis, function() {
        redis.get("parsers", function(err, result) {
            if (err || !result) {
                console.log('failed to get parsers from redis, retrying');
                return setTimeout(start, 10000);
            }
            var parsers = JSON.parse(result);
            //concurrent job processors per parse worker
            var parallelism = config.PARSER_PARALLELISM;
            var parsersExpanded = [];
            parsers.forEach(function(p) {
                for (var i = 0; i < parallelism; i++) {
                    parsersExpanded.push(p);
                }
            });
            parsers = parsersExpanded;
            var capacity = parsers.length;
            if (cluster.isMaster && config.NODE_ENV !== "test") {
                console.log("[PARSEMANAGER] starting master");
                utility.cleanup(queue, 'parse');
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
                queue.process('parse', function(job, ctx, cb) {
                    console.log("starting parse job: %s", job.id);
                    job.parser_url = getParserUrl(job);
                    //TODO check if the assigned url is healthy before trying to parse?
                    //if not, use ctx to pause
                    //keep checking status and resume the worker when the parse worker is alive again
                    //current behavior will just keep retrying the url
                    return processParse(job, ctx, cb);
                });

                function getParserUrl(job) {
                    return config.PARSER_URL || parsers[i] || parsers[Math.floor(Math.random() * parsers.length)];
                }
            }
        });
    });
}

function processParse(job, ctx, cb) {
    var match_id = job.data.payload.match_id;
    var match = job.data.payload;
    console.time("parse " + match_id);
    if (match.start_time < moment().subtract(7, 'days').format('X') && !(match.leagueid > 0)) {
        //expired, can't parse even if we have url
        //TODO non-valve urls don't expire, we can try using them
        //TODO do we want to write parse_status:1 if expired?  we should not overwrite existing parse_status:2
        console.log("replay too old, url expired");
        console.timeEnd("parse " + match_id);
        return cb();
    }
    //get the replay url and save it
    getReplayUrl(match, function(err) {
        if (err) {
            return cb(err);
        }
        else {
            //match object should now contain replay url, and url should be persisted
            console.log("[PARSER] parsing from %s", job.data.payload.url);
            var url = job.data.payload.url;
            var target = job.parser_url + "&url=" + url;
            console.log("target: %s", target);
            request({
                url: target
            }, function(err, resp, body) {
                if (err || resp.statusCode !== 200 || !body) {
                    return cb(err || resp.statusCode || "http request error");
                }
                try {
                    body = JSON.parse(body);
                }
                catch (e) {
                    return cb(e);
                }
                if (body.error) {
                    return cb(body.error);
                }
                var parsed_data = body;
                //extend match object with parsed data, keep existing data if key conflict (match_id)
                for (var key in parsed_data) {
                    match[key] = match[key] || parsed_data[key];
                }
                match.players.forEach(function(p) {
                    utility.mergeObjects(p, parsed_data.players[p.player_slot % (128 - 5)]);
                });
                match.parse_status = 2;
                insertMatch(db, redis, queue, match, {
                    type: "parsed"
                }, function(err) {
                    console.timeEnd("parse " + match_id);
                    return cb(err);
                });
            });
        }
    });
}