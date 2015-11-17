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
var moment = require('moment');
var app = express();
var port = config.PORT || config.WORK_PORT;
var active_jobs = {};
var pooled_jobs = {};
var startedAt = moment();
var memwatch = require('memwatch-next');
var hd = new memwatch.HeapDiff();
memwatch.on('leak', function(info) {
    console.error(info);
});
memwatch.on('stats', function(stats) {
    var diff = hd.end();
    console.error(JSON.stringify(diff));
    hd = new memwatch.HeapDiff();
    console.error(stats);
});
buildSets(db, redis, function(err) {
    if (err) {
        throw err;
    }
    var pool_size = 200;
    queue.parse.process(pool_size, function(job, cb) {
        //save the callback for this job
        job.cb = cb;
        var match = job.data.payload;
        //get the replay url and save it to db
        return getReplayUrl(db, redis, match, function(err) {
            if (err) {
                return cb(err);
            }
            //put it in the pool
            pooled_jobs[job.jobId] = job;
            console.log('loaded job %s into pool, %s jobs in pool, %s jobs active', job.jobId, Object.keys(pooled_jobs).length, Object.keys(active_jobs).length);
        });
    });
    start();
});

function start() {
    app.use(bodyParser.json({
        limit: '1mb'
    }));
    app.get("/", function(req, res) {
        res.json({
            started_at: startedAt.format(),
            started_ago: startedAt.fromNow()
        });
    });
    app.get('/parse', function(req, res) {
        if (config.RETRIEVER_SECRET && req.query.key !== config.RETRIEVER_SECRET) {
            return res.status(500).json({
                error: "invalid key"
            });
        }
        var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        console.log('client %s requested work', ip);
        var job = pooled_jobs[Object.keys(pooled_jobs)[0]];
        if (!job) {
            console.log('no work available');
            return res.status(500).json({
                error: "no work available"
            });
        }
        delete pooled_jobs[job.jobId];
        active_jobs[job.jobId] = job;
        var match = job.data.payload;
        job.submitWork = function submitWork(parsed_data) {
            if (parsed_data.error) {
                return job.exit(parsed_data.error);
            }
            delete parsed_data.key;
            delete parsed_data.jobId;
            //extend match object with parsed data, keep existing data if key conflict (match_id)
            //match.players was deleted earlier during insertion of api data
            for (var key in parsed_data) {
                match[key] = match[key] || parsed_data[key];
            }
            match.parse_status = 2;
            return insertMatch(db, redis, queue, match, {
                type: "parsed"
            }, job.exit);
        };
        job.exit = function exit(err) {
            clearTimeout(job.expire);
            delete active_jobs[job.jobId];
            return job.cb(err);
        };
        job.expire = setTimeout(function() {
            console.log('job %s expired', job.jobId);
            return job.exit("timeout");
        }, 180 * 1000);
        console.log('server sent jobid %s', job.jobId);
        return res.json({
            jobId: job.jobId,
            data: job.data
        });
    });
    app.post('/parse', function(req, res) {
        //validate request
        if (config.RETRIEVER_SECRET && req.body.key !== config.RETRIEVER_SECRET) {
            return res.status(500).json({
                error: "invalid key"
            });
        }
        console.log('received submitted work');
        if (active_jobs[req.body.jobId]) {
            var job = active_jobs[req.body.jobId];
            job.submitWork(req.body);
            return res.json({
                error: null
            });
        }
        else {
            return res.status(500).json({
                error: "no active job with this jobid"
            });
        }
    });
    var server = app.listen(port, function() {
        var host = server.address().address;
        console.log('[WORKSERVER] listening at http://%s:%s', host, port);
    });
}
