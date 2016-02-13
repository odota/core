var express = require('express');
var utility = require('./utility');
var bodyParser = require('body-parser');
var runParse = require('./runParse');
var app = express();
var capacity = require('os').cpus().length;
var startedAt = new Date();
var os = require('os');
var fs = require('fs');
var config = require('./config');
app.use(bodyParser.json());
app.get('/', function(req, res)
{
    res.json(
    {
        capacity: capacity,
        version: utility.getParseSchema().version,
        started_at: startedAt
    });
});
app.get('/redis/:key', function(req, res, cb)
{
    redis.get(new Buffer('upload_blob:' + req.params.key), function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        res.send(result);
    });
});
app.listen(config.PARSER_PORT);
var queue = require('./queue');
var getReplayUrl = require('./getReplayUrl');
var db = require('./db');
var redis = require('./redis');
var moment = require('moment');
var queries = require('./queries');
var insertMatch = queries.insertMatch;
var async = require('async');
var compute = require('./compute');
var renderMatch = compute.renderMatch;
var computeMatchData = compute.computeMatchData;
var computePlayerMatchData = compute.computePlayerMatchData;
queue.parse.process(function(job, cb)
{
    console.log("parse job: %s", job.jobId);
    var match = job.data.payload;
    async.series(
    {
        "getDataSource": match.replay_blob_key ? function(cb)
        {
            //getReplayBlob(redis, match, cb);
            match.url = "http://localhost:" + config.PARSER_PORT + "/redis/" + match.replay_blob_key;
            cb();
        } : function(cb)
        {
            getReplayUrl(db, redis, match, cb);
        },
        "runParse": function(cb)
        {
            try
            {
                runParse(match, job, function(err, parsed_data)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    //extend match object with parsed data, keep existing data if key conflict
                    //match.players was deleted earlier during insertion of api data
                    for (var key in parsed_data)
                    {
                        match[key] = match[key] || parsed_data[key];
                    }
                    match.parse_status = 2;
                    cb(err);
                });
            }
            catch (e)
            {
                cb(e);
                setTimeout(function(){throw e;}, 1000);
            }
        },
        "insertMatch": match.replay_blob_key ? function(cb)
        {
            //save uploaded replay parse in redis
            match.players.forEach(function(p)
            {
                p.gold_per_min = ~~(p.gold / match.duration * 60);
                p.xp_per_min = ~~(p.xp / match.duration * 60);
                p.duration = match.duration;
                computePlayerMatchData(p);
            });
            computeMatchData(match);
            renderMatch(match);
            redis.setex('match:' + match.replay_blob_key, 60 * 60 * 24 * 7, JSON.stringify(match), cb);
        } : function(cb)
        {
            //fs.writeFileSync('output.json', JSON.stringify(match));
            insertMatch(db, redis, queue, match,
            {
                type: "parsed"
            }, cb);
        },
    }, function(err)
    {
        if (err)
        {
            console.log(err);
            return cb(err);
        }
        var hostname = os.hostname();
        redis.zadd("parser:" + hostname, moment().format('X'), match.match_id);
        redis.lpush("parse_delay", new Date() - (match.start_time + match.duration) * 1000);
        redis.ltrim("parse_delay", 0, 10000);
        return cb(err, match.match_id);
    });
});
