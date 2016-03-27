var express = require('express');
var utility = require('./utility');
var bodyParser = require('body-parser');
var app = express();
var capacity = require('os').cpus().length;
var startedAt = new Date();
var os = require('os');
var config = require('./config');
var request = require('request');
var cp = require('child_process');
var ndjson = require('ndjson');
var spawn = cp.spawn;
var progress = require('request-progress');
var processAllPlayers = require('./processors/processAllPlayers');
var processTeamfights = require('./processors/processTeamfights');
var processReduce = require('./processors/processReduce');
var processUploadProps = require('./processors/processUploadProps');
var processParsedData = require('./processors/processParsedData');
var processMetadata = require('./processors/processMetadata');
var processExpand = require('./processors/processExpand');
var stream = require('stream');
var queue = require('./queue');
var pQueue = queue.getQueue('parse');
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
var benchmarkMatch = require('./benchmarkMatch');
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
pQueue.process(function(job, cb)
{
    console.log("parse job: %s", job.jobId);
    var match = job.data.payload;
    async.series(
    {
        "getDataSource": match.replay_blob_key ? function(cb)
        {
            match.url = "http://localhost:" + config.PARSER_PORT + "/redis/" + match.replay_blob_key;
            cb();
        } : function(cb)
        {
            getReplayUrl(db, redis, match, cb);
        },
        "runParse": function(cb)
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
        },
        "insertMatch": match.replay_blob_key ? function(cb)
        {
            //save uploaded replay parse in redis
            match.match_id = match.upload.match_id;
            match.game_mode = match.upload.game_mode;
            match.radiant_win = match.upload.radiant_win;
            match.duration = match.upload.duration;
            match.players.forEach(function(p, i)
            {
                utility.mergeObjects(p, match.upload.player_map[p.player_slot]);
                p.gold_per_min = ~~(p.gold / match.duration * 60);
                p.xp_per_min = ~~(p.xp / match.duration * 60);
                p.duration = match.duration;
                computePlayerMatchData(p);
            });
            computeMatchData(match);
            renderMatch(match);
            benchmarkMatch(redis, match, function(err)
            {
                if (err)
                {
                    return cb(err);
                }
                redis.setex('match:' + match.replay_blob_key, 60 * 60 * 24 * 7, JSON.stringify(match), cb);
            });
        } : function(cb)
        {
            //fs.writeFileSync('output.json', JSON.stringify(match));
            insertMatch(db, redis, match,
            {
                type: "parsed"
            }, cb);
        },
    }, function(err)
    {
        if (err)
        {
            console.log(err, err.stack);
            if (err !== "404")
            {
                setTimeout(function()
                {
                    console.error('encountered exception, restarting');
                    process.exit(1);
                }, 1000);
            }
            return cb(err);
        }
        var hostname = os.hostname();
        redis.zadd("parser:" + hostname, moment().format('X'), match.match_id);
        if (match.start_time)
        {
            redis.lpush("parse_delay", new Date() - (match.start_time + match.duration) * 1000);
            redis.ltrim("parse_delay", 0, 10000);
        }
        return cb(err, match.match_id);
    });
});

function runParse(match, job, cb)
{
    var timeout = setTimeout(function()
    {
        exit('timeout');
    }, 300000);
    var url = match.url;
    var inStream;
    var parseStream;
    var bz;
    var parser;
    var entries = [];
    createInputStream();

    function createInputStream()
    {
        inStream = progress(request(
        {
            url: url,
            encoding: null,
            timeout: 30000
        })).on('progress', function(state)
        {
            console.log(JSON.stringify(
            {
                url: url,
                state: state
            }));
            if (job)
            {
                job.progress(state.percentage * 100);
            }
        }).on('response', function(response)
        {
            if (response.statusCode === 200)
            {
                forwardInput(inStream);
            }
            else
            {
                exit(response.statusCode.toString());
            }
        }).on('error', exit);
    }

    function forwardInput(inStream)
    {
        parser = spawn("java", ["-jar",
                    "-Xmx64m",
                    "java_parser/target/stats-0.1.0.jar"
                ],
        {
            //we may want to ignore stderr so the child doesn't stay open
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf8'
        });
        parser.on('close', (code) =>
        {
            if (code)
            {
                exit(code);
            }
        });
        parseStream = ndjson.parse();
        if (url && url.slice(-3) === "bz2")
        {
            bz = spawn("bunzip2");
        }
        else
        {
            var str = stream.PassThrough();
            bz = {
                stdin: str,
                stdout: str
            };
        }
        inStream.pipe(bz.stdin);
        bz.stdout.pipe(parser.stdin);
        bz.stdin.on('error', exit);
        bz.stdout.on('error', exit);
        parser.stdout.pipe(parseStream);
        parser.stdin.on('error', exit);
        parser.stdout.on('error', exit);
        parser.stderr.on('data', function printStdErr(data)
        {
            console.log(data.toString());
        });
        parseStream.on('data', function handleStream(e)
        {
            if (e.type === 'epilogue')
            {
                incomplete = false;
            }
            entries.push(e);
        });
        parseStream.on('end', exit);
        parseStream.on('error', exit);
    }
    var incomplete = "incomplete";
    var exited = false;

    function exit(err)
    {
        if (exited)
        {
            return;
        }
        exited = true;
        err = err || incomplete;
        clearTimeout(timeout);
        if (err)
        {
            return cb(err);
        }
        else
        {
            var message = "time spent on post-processing match ";
            console.time(message);
            var meta = processMetadata(entries);
            var res = processExpand(entries, meta, populate);
            var parsed_data = processParsedData(res.parsed_data, meta, populate);
            var teamfights = processTeamfights(res.tf_data, meta, populate);
            var upload = processUploadProps(res.uploadProps, meta, populate);
            var ap = processAllPlayers(res.int_data);
            parsed_data.teamfights = teamfights;
            parsed_data.radiant_gold_adv = ap.radiant_gold_adv;
            parsed_data.radiant_xp_adv = ap.radiant_xp_adv;
            parsed_data.upload = upload;
            //processMultiKillStreaks();
            //processReduce(res.expanded);
            console.timeEnd(message);
            return cb(err, parsed_data);
        }
    }
}

function populate(e, container)
{
    switch (e.type)
    {
        case 'interval':
            break;
        case 'player_slot':
            container.players[e.key].player_slot = e.value;
            break;
        case 'chat':
            container.chat.push(JSON.parse(JSON.stringify(e)));
            break;
        case 'CHAT_MESSAGE_TOWER_KILL':
        case 'CHAT_MESSAGE_TOWER_DENY':
        case 'CHAT_MESSAGE_BARRACKS_KILL':
        case 'CHAT_MESSAGE_FIRSTBLOOD':
        case 'CHAT_MESSAGE_AEGIS':
        case 'CHAT_MESSAGE_AEGIS_STOLEN':
        case 'CHAT_MESSAGE_DENIED_AEGIS':
        case 'CHAT_MESSAGE_ROSHAN_KILL':
            container.objectives.push(JSON.parse(JSON.stringify(e)));
            break;
        default:
            if (!container.players[e.slot])
            {
                //couldn't associate with a player, probably attributed to a creep/tower/necro unit
                //console.log(e);
                return;
            }
            var t = container.players[e.slot][e.type];
            if (typeof t === "undefined")
            {
                //container.players[0] doesn't have a type for this event
                console.log("no field in parsed_data.players for %s", e.type);
                return;
            }
            else if (e.posData)
            {
                //fill 2d hash with x,y values
                var x = e.key[0];
                var y = e.key[1];
                if (!t[x])
                {
                    t[x] = {};
                }
                if (!t[x][y])
                {
                    t[x][y] = 0;
                }
                t[x][y] += 1;
            }
            else if (e.max)
            {
                //check if value is greater than what was stored
                if (e.value > t.value)
                {
                    container.players[e.slot][e.type] = e;
                }
            }
            else if (t.constructor === Array)
            {
                //determine whether we want the value only (interval) or the time and key (log)
                //either way this creates a new value so e can be mutated later
                var arrEntry = (e.interval) ? e.value :
                {
                    time: e.time,
                    key: e.key
                };
                t.push(arrEntry);
            }
            else if (typeof t === "object")
            {
                //add it to hash of counts
                e.value = e.value || 1;
                t[e.key] ? t[e.key] += e.value : t[e.key] = e.value;
            }
            else if (typeof t === "string")
            {
                //string, used for steam id
                container.players[e.slot][e.type] = e.key;
            }
            else
            {
                //we must use the full reference since this is a primitive type
                //use the value most of the time, but key when stuns since value only holds Integers in Java
                //replace the value directly
                container.players[e.slot][e.type] = e.value || Number(e.key);
            }
            break;
    }
}
