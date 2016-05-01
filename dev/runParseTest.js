
var request = require('request');
var progress = require('request-progress');
var JSONStream = require('JSONStream');
var spawn = require('child_process').spawn;
var inStream = progress(request('http://replay112.valve.net/570/2320368734_1824232908.dem.bz2'));

var bz = spawn('bunzip2');
var entries = [];
inStream.on('progress', function(state)
{
    console.log(JSON.stringify(
    {
        state: state
    }));
});
inStream.pipe(bz.stdin);

var parser = spawn("java", ["-jar",
                    "-Xmx64m",
                    "./java_parser/target/stats-0.1.0.jar"
],
{
    //we may want to ignore stderr so the child doesn't stay open
    stdio: ['pipe', 'pipe', 'ignore'],
    encoding: 'utf8'
});
bz.stdout.pipe(parser.stdin);
bz.stdin.on('error', exit);
bz.stdout.on('error', exit);
var parseStream = JSONStream.parse();
parser.stdout.pipe(parseStream);
parseStream.on('data', function handleStream(e)
{
    entries.push(e);
});
parseStream.on('end', exit);
parseStream.on('error', exit);
function exit(err)
{
    console.error(err);
    console.log(entries.length);
    process.exit(Number(err));
}

/*
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
var JSONStream = require('JSONStream');
var spawn = cp.spawn;
var insertMatch = queries.insertMatch;
var benchmarkMatch = queries.benchmarkMatch;
var renderMatch = compute.renderMatch;
var computeMatchData = compute.computeMatchData;
// Parse state
// Array buffer to store the events
var entries = [];
var incomplete = "incomplete";
var exited = false;
var timeout = setTimeout(function()
{
    exit('timeout');
}, 300000);
var url = 'http://replay112.valve.net/570/2322754223_524157948.dem.bz2';
var inStream = progress(request(
{
    url: url
}));
inStream.on('progress', function(state)
{
    console.log(JSON.stringify(
    {
        url: url,
        state: state
    }));
}).on('response', function(response)
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
var parser = spawn("java", [
        "-jar",
        "-Xmx64m",
        "./java_parser/target/stats-0.1.0.jar"
        ],
{
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8'
});
parser.stdin.on('error', exit);
parser.stdout.on('error', exit);
var parseStream = JSONStream.parse();
parseStream.on('data', function handleStream(e)
{
    if (e.type === 'epilogue')
    {
        console.log('received epilogue');
        incomplete = false;
    }
    entries.push(e);
});
parseStream.on('end', exit);
parseStream.on('error', exit);
// Pipe together the streams
inStream.pipe(bz.stdin);
bz.stdout.pipe(parser.stdin);
parser.stdout.pipe(parseStream);
parser.stderr.on('data', function printStdErr(data)
{
    console.log(data.toString());
});

function exit(err)
{
    if (exited)
    {
        console.log('already exited');
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
            var res = processExpand(entries, meta);
            var parsed_data = processParsedData(res.parsed_data, meta);
            var teamfights = processTeamfights(res.tf_data, meta);
            var upload = processUploadProps(res.uploadProps, meta);
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
        catch (e)
        {
            return cb(e);
        }
    }
}

function cb(err, parsed_data)
{
    if (err)
    {
        console.error(err);
    }
    console.log(parsed_data);
}
*/