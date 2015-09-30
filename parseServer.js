var r = require('./redis');
var redis = r.client;
var queue = r.queue;
var utility = require('./utility');
var config = require('./config');
var getReplayUrl = require('./getReplayUrl');
var moment = require('moment');
var db = require('./db');
var insertMatch = require('./queries').insertMatch;
var bodyParser = require('body-parser');
var express = require('express');
var app = express();
var port = config.PORT || config.PARSER_PORT;
var active_jobs = {};
app.use(bodyParser.json());
app.get('/parse', function(req, res) {
    queue.process('parse', function(job, ctx, cb) {
        active_jobs[job.id] = job;
        queue.shutdown(120 * 1000, function(err) {
            if (err) {
                console.error(err);
            }
            delete active_jobs[job.id];
        });
        processParse(res, job, cb);
    });
});
app.post('/parse', function(req, res) {
    //got data from worker, signal the job with this match_id
    var job = active_jobs[req.body.jobid];
    if (job) {
        delete req.body.jobid;
        job.emit('submitwork', null, req.body);
        res.json({
            error: null
        });
    }
    else {        res.json({
            error: "no active job with this jobid"
        });
    }
});
var server = app.listen(port, function() {
    var host = server.address().address;
    console.log('[PARSER] listening at http://%s:%s', host, port);
});

function processParse(res, job, cb) {
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
            res.json(job.toJSON());
            job.on('submitwork', function(err, body) {
                if (err || !body) {
                    return cb(err || "http request error");
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