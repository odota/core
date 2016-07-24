/**
 * Worker that parses replays
 * The actual parsing is done by invoking the Java-based parser.
 * The resulting event stream (newline-delimited JSON) is run through a series of processors to count/aggregate it into a single object
 * This object is passed to insertMatch to persist the data into the database.
 **/
var utility = require('../util/utility');
var getReplayUrl = require('../util/getReplayUrl');
var config = require('../config');
var db = require('../store/db');
var redis = require('../store/redis');
var cassandra = config.ENABLE_CASSANDRA_MATCH_STORE_WRITE ? require('../store/cassandra') : undefined;
var queue = require('../store/queue');
var queries = require('../store/queries');
var compute = require('../util/compute');
var processAllPlayers = require('../processors/processAllPlayers');
var processTeamfights = require('../processors/processTeamfights');
var processReduce = require('../processors/processReduce');
var processUploadProps = require('../processors/processUploadProps');
var processParsedData = require('../processors/processParsedData');
var processMetadata = require('../processors/processMetadata');
var processExpand = require('../processors/processExpand');
var startedAt = new Date();
var request = require('request');
var cp = require('child_process');
var progress = require('request-progress');
var stream = require('stream');
var pQueue = queue.getQueue('parse');
var async = require('async');
const readline = require('readline');
var spawn = cp.spawn;
var insertMatch = queries.insertMatch;
var benchmarkMatch = queries.benchmarkMatch;
var renderMatch = compute.renderMatch;
var computeMatchData = compute.computeMatchData;
//EXPRESS, use express to provide an HTTP interface to replay blobs uploaded to Redis.
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.json());
app.get('/', function (req, res)
{
    res.json(
    {
        version: utility.getParseSchema().version,
        started_at: startedAt
    });
});
app.get('/redis/:key', function (req, res, cb)
{
    redis.get(new Buffer('upload_blob:' + req.params.key), function (err, result)
    {
        if (err)
        {
            return cb(err);
        }
        res.send(result);
    });
});
app.listen(config.PARSER_PORT);
//END EXPRESS
// Start Java parse server
var parseServer = spawn("java", ["-jar", "-Xmx256m", "./java_parser/target/stats-0.1.0.jar", config.PARSE_SERVER_PORT],
{
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8'
});
parseServer.on('exit', function ()
{
    throw new Error("restarting due to parse server exit");
});
process.on('exit', function(){
   parseServer.kill(); 
});
pQueue.process(config.PARSER_PARALLELISM, function (job, cb)
{
    console.log("parse job: %s", job.jobId);
    var match = job.data.payload;
    async.series(
    {
        "getDataSource": function (cb)
        {
            if (match.replay_blob_key)
            {
                match.url = "http://localhost:" + config.PARSER_PORT + "/redis/" + match.replay_blob_key;
                cb();
            }
            else
            {
                getReplayUrl(db, redis, match, cb);
            }
        },
        "runParse": function (cb)
        {
            runParse(match, job, function (err, parsed_data)
            {
                if (err)
                {
                    return cb(err);
                }
                parsed_data.match_id = match.match_id;
                parsed_data.pgroup = match.pgroup;
                parsed_data.radiant_win = match.radiant_win;
                parsed_data.start_time = match.start_time;
                parsed_data.duration = match.duration;
                parsed_data.replay_blob_key = match.replay_blob_key;
                parsed_data.doLogParse = match.doLogParse;
                if (match.replay_blob_key)
                {
                    insertUploadedParse(parsed_data, cb);
                }
                else
                {
                    insertStandardParse(parsed_data, cb);
                }
            });
        },
    }, function (err)
    {
        if (err)
        {
            console.error(err.stack || err);
            /*
            if (err !== "404")
            {
                setTimeout(function()
                {
                    console.error('encountered exception, restarting');
                    process.exit(1);
                }, 1000);
            }
            */
        }
        return cb(err, match.match_id);
    });
});

function insertUploadedParse(match, cb)
{
    console.log('saving uploaded parse');
    //save uploaded replay parse in redis as a cached match
    match.match_id = match.upload.match_id;
    match.game_mode = match.upload.game_mode;
    match.radiant_win = match.upload.radiant_win;
    match.duration = match.upload.duration;
    match.players.forEach(function (p, i)
    {
        utility.mergeObjects(p, match.upload.player_map[p.player_slot]);
        p.gold_per_min = ~~(p.gold / match.duration * 60);
        p.xp_per_min = ~~(p.xp / match.duration * 60);
        p.duration = match.duration;
        computeMatchData(p);
    });
    computeMatchData(match);
    renderMatch(match);
    benchmarkMatch(redis, match, function (err)
    {
        if (err)
        {
            return cb(err);
        }
        redis.setex('match:' + match.replay_blob_key, 60 * 60 * 24 * 7, JSON.stringify(match), cb);
    });
}

function insertStandardParse(match, cb)
{
    console.log('insertMatch');
    //fs.writeFileSync('output.json', JSON.stringify(match));
    insertMatch(db, redis, match,
    {
        type: "parsed",
        cassandra: cassandra,
        skipParse: true,
        doLogParse: match.doLogParse,
    }, cb);
}

function runParse(match, job, cb)
{
    // Parse state
    // Array buffer to store the events
    var entries = [];
    var incomplete = "incomplete";
    var exited = false;
    var timeout = setTimeout(function ()
    {
        exit('timeout');
    }, 300000);
    var url = match.url;
    // Streams
    var inStream = progress(request(
    {
        url: url,
        encoding: null,
    }));
    inStream.on('progress', function (state)
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
    }).on('response', function (response)
    {
        if (response.statusCode !== 200)
        {
            exit(response.statusCode.toString());
        }
    }).on('error', exit);
    var bz;
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
    bz.stdin.on('error', exit);
    bz.stdout.on('error', exit);
    inStream.pipe(bz.stdin);
    /*
    var parser = spawn("java", [
        "-jar",
        "-Xmx128m",
        "./java_parser/target/stats-0.1.0.jar",
        ],
    {
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf8'
    });
    parser.stdin.on('error', exit);
    parser.stdout.on('error', exit);
    parser.stderr.on('data', function printStdErr(data)
    {
        console.log(data.toString());
    });
    bz.stdout.pipe(parser.stdin);
    */
    var parser = request.post('http://localhost:'+config.PARSE_SERVER_PORT);
    bz.stdout.pipe(parser);
    const parseStream = readline.createInterface(
    {
        input: parser
    });
    parseStream.on('line', function handleStream(e)
    {
        e = JSON.parse(e);
        if (e.type === 'epilogue')
        {
            console.log('received epilogue');
            incomplete = false;
            parseStream.close();
            exit();
        }
        entries.push(e);
    });
    request.debug = true;

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
            try
            {
                var message = "time spent on post-processing match ";
                console.time(message);
                var meta = processMetadata(entries);
                var logs = processReduce(entries, match, meta);
                var res = processExpand(entries, meta);
                var parsed_data = processParsedData(res.parsed_data);
                var teamfights = processTeamfights(res.tf_data, meta);
                var upload = processUploadProps(res.uploadProps, meta);
                var ap = processAllPlayers(res.int_data);
                parsed_data.teamfights = teamfights;
                parsed_data.radiant_gold_adv = ap.radiant_gold_adv;
                parsed_data.radiant_xp_adv = ap.radiant_xp_adv;
                parsed_data.upload = upload;
                parsed_data.logs = logs;
                //processMultiKillStreaks();
                console.timeEnd(message);
                return cb(err, parsed_data);
            }
            catch (e)
            {
                return cb(e);
            }
        }
    }
}
