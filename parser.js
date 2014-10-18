var async = require("async"),
    request = require("request"),
    fs = require("fs"),
    spawn = require('child_process').spawn,
    moment = require('moment'),
    Bunzip = require('seek-bzip'),
    utility = require('./utility'),
    matches = utility.matches,
    steam = require("steam"),
    dota2 = require("dota2"),
    Steam = new steam.SteamClient(),
    Dota2 = new dota2.Dota2Client(Steam, false),
    AWS = require('aws-sdk');
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var seaport = require('seaport');
var ports = seaport.connect(process.env.SEAPORT_HOST || "localhost", process.env.SEAPORT_PORT || 9001);
var loginNum = 0
var users = process.env.STEAM_USER.split()
var passes = process.env.STEAM_PASS.split()
var codes = process.env.STEAM_GUARD_CODE.split()
var pq = async.queue(parseReplay, 1)
var replay_dir = "replays/"
var parser_file = "parser/target/stats-0.1.0.jar"
if(!fs.existsSync(replay_dir)) {
    fs.mkdir(replay_dir)
}

app.use(bodyParser.urlencoded({
    extended: true
}));
var port = ports.register('parser');
app.listen(port, function(){
    console.log('[PARSER] listening on port ' + port);
});
var router = express.Router();
app.post("/", function(req, res) {
    matches.findOne({
        match_id: Number(req.body.match_id)
    }, function(err, doc) {
        if (doc){
            pq.push(doc, function(err) {})
            res.json({
                status: 0,
                match_id: doc.match_id,
                position: pq.length()
            })   
        }
        else{
            res.status(500).json({
                status: 1
            })
        }
    })
})

/*
 * Downloads a match replay
 */

function download(match, cb) {
    var match_id = match.match_id
    var fileName = replay_dir + match_id + ".dem"
    if(fs.existsSync(fileName)) {
        console.log("[PARSER] found local replay for match %s", match_id)
        cb(null, fileName);
    } else {
        getReplayUrl(match, function(err, url) {
            if(err) {
                return cb(err)
            }
            downloadWithRetry(url, 1000, function(err, body) {
                var archiveName = match_id + ".dem.bz2"
                uploadToS3(archiveName, body, function(err) {
                    //decompress and write locally
                    var decomp = Bunzip.decode(body);
                    fs.writeFile(fileName, decomp, function(err) {
                        console.log("[PARSER] downloaded/decompressed replay for match %s", match_id)
                        return cb(null, fileName)
                    })
                })
            })
        })
    }
}
/*
 * Logs onto steam and launches Dota 2
 */

function logOnSteam(user, pass, authcode, cb) {
    var onSteamLogOn = function onSteamLogOn() {
        console.log("[STEAM] Logged on.");
        Dota2.launch();
        Dota2.on("ready", function() {
            return cb(null)
        })
    },
        onSteamSentry = function onSteamSentry(newSentry) {
            console.log("[STEAM] Received sentry.");
            fs.writeFileSync("sentry", newSentry);
        },
        onSteamServers = function onSteamServers(servers) {
            console.log("[STEAM] Received servers.");
            fs.writeFile("servers", JSON.stringify(servers));
        },
        onSteamError = function onSteamError(e) {
            return cb(e)
        };
    if(!fs.existsSync("sentry")) {
        fs.openSync("sentry", 'w')
    }
    var logOnDetails = {
        "accountName": user,
        "password": pass
    },
        sentry = fs.readFileSync("sentry");
    if(authcode) logOnDetails.authCode = authcode;
    if(sentry.length) logOnDetails.shaSentryfile = sentry;
    Steam.logOn(logOnDetails);
    Steam.on("loggedOn", onSteamLogOn).on('sentry', onSteamSentry).on('servers', onSteamServers).on('error', onSteamError);
}

function getReplayUrl(match, cb) {
    if(match.start_time > moment().subtract(7, 'days').format('X')) {
        if(!Steam.loggedOn) {
            loginNum += 1
            loginNum = loginNum % users.length
            logOnSteam(users[loginNum], passes[loginNum], codes[loginNum], function(err) {
                if (err){
                    console.log(err)
                }
                setTimeout(function(){
                    getReplayUrl(match, cb)
                }, 5000)
            })
        } else {
            console.log("[DOTA] requesting replay %s", match.match_id)
            var timeoutProtect = setTimeout(function() {
                // Clear the local timer variable, indicating the timeout has been triggered.
                timeoutProtect = null;
                Dota2.exit()
                Steam.logOff()
                console.log("[DOTA] request for replay timed out, relogging")
                getReplayUrl(match, cb)
            }, 15000)
            Dota2.matchDetailsRequest(match.match_id, function(err, data) {
                if(timeoutProtect) {
                    clearTimeout(timeoutProtect);
                    if(err) {
                        return cb(err)
                    }
                    var url = "http://replay" + data.match.cluster + ".valve.net/570/" + match.match_id + "_" + data.match.replaySalt + ".dem.bz2";
                    return cb(null, url)
                }
            })
        }
    } else {
        getS3URL(match.match_id, function(err,url){
            cb(err, url)
        })
    }
}

function getS3URL(match_id, cb){
    if(process.env.AWS_S3_BUCKET) {
        var archiveName = match_id + ".dem.bz2"
        var s3 = new AWS.S3()
        var params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: archiveName
        }
        s3.headObject(params, function(err, data) {
            if (!err){
                var url = s3.getSignedUrl('getObject', params);
                cb(null, url)
            }
            else {
                console.log("[S3] %s not in S3", match_id)
                cb("Replay not in S3")
            }
        })
    }
    else{
        cb("S3 not defined")
    }
}

function uploadToS3(archiveName, body, cb) {
    if(process.env.AWS_S3_BUCKET) {
        var s3 = new AWS.S3()
        var params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: archiveName
        }
        s3.headObject(params, function(err, data) {
            if(err) {
                params.Body = body
                s3.putObject(params, function(err, data) {
                    if(err) {
                        console.log('[S3] could not upload to S3')
                    } else {
                        console.log('[S3] Successfully uploaded replay to S3: %s ', archiveName)
                    }
                    cb(err)
                })
            } else {
                console.log('[S3] replay already exists in S3')
                cb(err)
            }
        })
    } else {
        cb(null)
    }
}
/*
 * Tries to download a file from the url repeatedly
 */

function downloadWithRetry(url, timeout, cb) {
    console.log("[PARSER] downloading from %s", url)
    request({
        url: url,
        encoding: null
    }, function(err, response, body) {
        if(err || response.statusCode !== 200) {
            console.log("[PARSER] failed to download from %s, retrying in %ds", url, timeout / 1000)
            setTimeout(function(){
                downloadWithRetry(url, timeout*2, cb)
            }, timeout)
        } else {
            cb(null, body);
        }
    })
}
/*
 * Parses a replay for a match
 */

function parseReplay(match, cb) {
    var match_id = match.match_id
    console.log("[PARSER] requesting parse for match %s", match_id)
    download(match, function(err, fileName) {
        if(err) {
            console.log("[PARSER] Error for match %s: %s", match_id, err)
            matches.update({
                match_id: match_id
            }, {
                $set: {
                    parse_status: 1
                }
            })
            return cb(err)
        }
        console.log("[PARSER] running parse on %s", fileName)
        var output = ""
        var cp = spawn("java", ["-jar",
                                parser_file,
                                fileName
                               ])
        //pipe hero names to stdin
        utility.constants.findOne({}, function(err, doc){
            cp.stdin.write(JSON.stringify(doc.hero_names))
            cp.stdin.end("\n")
        })
        cp.stdout.on('data', function(data) {
            output += data
        })
        cp.stderr.on('data', function(data) {
            console.log('[PARSER] match: %s, stderr: %s', match_id, data);
        })
        cp.on('exit', function(code) {
            console.log('[PARSER] match: %s, exit code: %s', match_id, code);
            if(!code) {
                //process parser output
                matches.update({
                    match_id: match_id
                }, {
                    $set: {
                        parsed_data: JSON.parse(output),
                        parse_status: 2
                    }
                })
                if(process.env.DELETE_REPLAYS) {
                    fs.unlink(fileName)
                }
            }
            cb(code)
        })
    })
}
