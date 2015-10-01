var r = require('./redis');
var redis = r.client;
var queue = r.queue;
var kue = r.kue;
var utility = require('./utility');
var config = require('./config');
var getReplayUrl = require('./getReplayUrl');
var moment = require('moment');
var db = require('./db');
var insertMatch = require('./queries').insertMatch;
var buildSets = require('./buildSets');
var bodyParser = require('body-parser');
var express = require('express');
var app = express();
var port = config.PORT || config.WORK_PORT;
var active_jobs = {};
buildSets(db, redis, function(err) {
    if (err) {
        throw err;
    }
    start();
});

function start() {
    utility.cleanup(queue, kue, 'parse');
    app.use(bodyParser.json({
        limit: '1mb'
    }));
    app.get('/parse', function(req, res) {
        //TODO validate request
        console.log('client requested work');
        
        queue.process('parse', function(job, ctx, cb) {
            console.log('server assigned jobid %s', job.id);
            var match_id = job.data.payload.match_id;
            var match = job.data.payload;
            //TODO non-valve urls don't expire, we can try using them
            if (match.start_time < moment().subtract(7, 'days').format('X') && !(match.leagueid > 0)) {
                //TODO do we want to write parse_status:1 if expired?  if so we should not overwrite existing parse_status:2
                console.log("replay too old, url expired");
                return cb();
            }
            //get the replay url and save it
            getReplayUrl(db, redis, match, function(err) {
                if (err) {
                    return cb(err);
                }
                else {
                    console.time("parse " + match_id);
                    console.log('server sent jobid %s', job.id);
                    res.json(job.toJSON());
                    job.on('submitwork', function(parsed_data) {
                        if (parsed_data.error) {
                            return cb(parsed_data.error);
                        }
                        //extend match object with parsed data, keep existing data if key conflict (match_id), players if we choose to keep it
                        for (var key in parsed_data) {
                            match[key] = match[key] || parsed_data[key];
                        }
                        match.players.forEach(function(p, i) {
                            p.player_slot = i < match.players.length / 2 ? i : i + (128 - 5);
                        });
                        match.parse_status = 2;
                        //fs.writeFileSync("output.json", JSON.stringify(match));
                        insertMatch(db, redis, queue, match, {
                            type: "parsed"
                        }, function(err) {
                            console.timeEnd("parse " + match_id);
                            return cb(err);
                        });
                    });
                }
            });
            //TODO set a job pool?  we don't want active jobs that aren't being processed though
            active_jobs[job.id] = job;
            //TODO reset timeout?
            setTimeout(function() {
                delete active_jobs[job.id];
            }, 120 * 1000);
            //TODO destroy the worker to avoid memory leak?
            //trying to pause causes .complete event to not fire
            //ctx.pause(1000, function(){});
        });
        /*
        kue.Job.rangeByType('parse', 'inactive', 0, -1, 'asc', function(err, selectedJobs) {
            if (selectedJobs[0]) {
                var job = selectedJobs[0];
                console.log(job);
                job.active();
                job.complete();
                job.emit('complete');
            }
        });
        */
    });
    app.post('/parse', function(req, res) {
        //TODO validate request
        //got data from worker, signal the job with this match_id
        console.log('received submitted work');
        //console.log(req.body);
        var job = active_jobs[req.body.id];
        if (job) {
            delete req.body.id;
            job.emit('submitwork', req.body);
            res.json({
                error: null
            });
        }
        else {
            res.json({
                error: "no active job with this jobid"
            });
        }
    });
    var server = app.listen(port, function() {
        var host = server.address().address;
        console.log('[WORKSERVER] listening at http://%s:%s', host, port);
    });
}