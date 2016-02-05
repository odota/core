var express = require('express');
var utility = require('./utility');
var bodyParser = require('body-parser');
var runParse = require('./runParse');
var app = express();
var capacity = require('os').cpus().length;
var startedAt = new Date();
var os = require('os');
var fs = require('fs');
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
var queue = require('./queue');
var getReplayUrl = require('./getReplayUrl');
var db = require('./db');
var redis = require('./redis');
var moment = require('moment');
var queries = require('./queries');
var insertMatch = queries.insertMatch;
queue.parse.process(function(job, cb)
{
    console.log("parse job: %s", job.jobId);
    var match = job.data.payload;
    getReplayUrl(db, redis, match, function(err)
    {
        if (err)
        {
            return cb(err);
        }
        runParse(match, function(err, parsed_data)
        {
            if (err)
            {
                console.log(err);
                return cb(err);
            }
            var match = job.data.payload;
            //extend match object with parsed data, keep existing data if key conflict (match_id)
            //match.players was deleted earlier during insertion of api data
            for (var key in parsed_data)
            {
                match[key] = match[key] || parsed_data[key];
            }
            match.parse_status = 2;
            //fs.writeFileSync('output.json', JSON.stringify(match));
            return insertMatch(db, redis, queue, match,
            {
                type: "parsed"
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
                return cb(err);
            });
        });
    });
});

