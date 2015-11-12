var redis = require('./redis');
var queue = require('./queue');
var utility = require('./utility');
var config = require('./config');
var getReplayUrl = require('./getReplayUrl');
var db = require('./db');
var insertMatch = require('./queries').insertMatch;
var buildSets = require('./buildSets');
var bodyParser = require('body-parser');
var express = require('express');
var app = express();
var port = config.PORT || config.WORK_PORT;
var active_jobs = {};
var pooled_jobs = {};
buildSets(db, redis, function(err) {
    if (err) {
        throw err;
    }
    var pool_size = 100;
    queue.parse.process(pool_size, function(job, cb) {
        console.log('loaded job %s into pool', job.jobId);
        //save the callback for this job
        job.cb = cb;
        //put it in the pool
        pooled_jobs[job.jobId] = job;
    });
    start();
});

function start() {
    app.use(bodyParser.json({
        limit: '1mb'
    }));
    app.get('/parse', function(req, res) {
        if (config.RETRIEVER_SECRET && req.query.key !== config.RETRIEVER_SECRET) {
            return res.status(500).json({
                error: "invalid key"
            });
        }
        console.log('client requested work');
        var job = pooled_jobs[Object.keys(pooled_jobs)[0]];
        var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        console.log('client %s requested work', ip);
        if (!job) {
            console.log('no work available');
            return res.status(500).json({
                error: "no work available"
            });
        }
        delete pooled_jobs[job.jobId];
        active_jobs[job.jobId] = job;
        console.log('server assigned jobid %s', job.jobId);
        var match = job.data.payload;
        //get the replay url and save it
        getReplayUrl(db, redis, match, function(err) {
            if (err) {
                //server won't send back a job in this case, let client timeout
                return exit(err);
            }
            job.expire = setTimeout(function() {
                console.log('job %s expired', job.jobId);
                return exit("timeout");
            }, 180 * 1000);
            job.submitWork = submitWork;
            console.log('server sent jobid %s', job.jobId);
            return res.json({
                jobId: job.jobId,
                data: job.data
            });
        });

        function submitWork(parsed_data) {
            if (parsed_data.error) {
                return exit(parsed_data.error);
            }
            delete parsed_data.key;
            delete parsed_data.jobId;
            //extend match object with parsed data, keep existing data if key conflict (match_id)
            //match.players was deleted earlier during insertion of api data
            for (var key in parsed_data) {
                match[key] = match[key] || parsed_data[key];
            }
            match.players.forEach(function(p, i) {
                p.account_id = match.slot_to_id[p.player_slot];
            });
            match.parse_status = 2;
            //fs.writeFileSync("output.json", JSON.stringify(match));
            return insertMatch(db, redis, queue, match, {
                type: "parsed"
            }, exit);
        }

        function exit(err) {
            clearTimeout(job.expire);
            delete active_jobs[job.jobId];
            return job.cb(err);
        }
    });
    app.post('/parse', function(req, res) {
        //validate request
        if (config.RETRIEVER_SECRET && req.body.key !== config.RETRIEVER_SECRET) {
            return res.status(500).json({
                error: "invalid key"
            });
        }
        //got data from worker, signal the job with this match_id
        console.log('received submitted work');
        if (active_jobs[req.body.jobId]) {
            var job = active_jobs[req.body.jobId];
            job.submitWork(req.body);
            return res.json({
                error: null
            });
        }
        else {
            return res.json({
                error: "no active job with this jobid"
            });
        }
    });
    var server = app.listen(port, function() {
        var host = server.address().address;
        console.log('[WORKSERVER] listening at http://%s:%s', host, port);
    });
}
