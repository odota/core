var request = require("request"),
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
    AWS = require('aws-sdk'),
    kue = require('kue');
var loginNum = 0
var users = process.env.STEAM_USER.split()
var passes = process.env.STEAM_PASS.split()
var codes = process.env.STEAM_GUARD_CODE.split()
var replay_dir = "replays/"
var parser_file = "parser/target/stats-0.1.0.jar"
var jobs = kue.createQueue();
jobs.promote(); //For delayed jobs
jobs.on('job complete', function(id, result) {
    kue.Job.get(id, function(err, job) {
        if(err) return
        job.remove(function(err) {
            console.log("removing parse request for match " + job.data.match.match_id)
        })
    })
})
jobs.on('job failed', function(id, result) {
    kue.Job.get(id, function(err, job) {
        if(err) return
        matches.update({
            match_id: job.data.match.match_id
        }, {
            $set: {
                parse_status: 1
            }
        })
    })
})
if(!fs.existsSync(replay_dir)) {
    fs.mkdir(replay_dir)
}
jobs.process('parse', function(job, done) {
    parseReplay(job, done)
})
/*
 * Downloads a match replay
 */

function download(job, cb) {
    var match_id = job.data.match.match_id
    var fileName = replay_dir + match_id + ".dem"
    if(fs.existsSync(fileName)) {
        console.log("[PARSER] found local replay for match %s", match_id)
        cb(null, fileName);
    } else {
        getReplayUrl(job, function(err, url) {
            if(err) {
                return cb(err)
            }
            console.log("[PARSER] downloading from %s", url)
            request({
                url: url,
                encoding: null
            }, function(err, response, body) {
                if(err || response.statusCode !== 200) {
                    console.log("[PARSER] failed to download from %s", url)
                    return cb("DOWNLOAD TIMEOUT")
                } else {
                    try {
                        var decomp = Bunzip.decode(body)
                        fs.writeFile(fileName, decomp, function(err) {
                            if(err) {
                                return cb(err)
                            }
                            console.log("[PARSER] downloaded/decompressed replay for match %s", match_id)
                            var archiveName = match_id + ".dem.bz2"
                            uploadToS3(archiveName, body, function(err) {
                                return cb(err, fileName)
                            })
                        })
                    } catch(e) {
                        return cb(e)
                    }
                }
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
        cb(null)
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
            console.log(e)
            cb(e)
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

function getReplayUrl(job, cb) {
    if('url' in job.data) {
        return cb(null, job.data.url)
    }
    var match = job.data.match
    if(match.start_time > moment().subtract(7, 'days').format('X')) {
        if(!Steam.loggedOn) {
            loginNum += 1
            loginNum = loginNum % users.length
            logOnSteam(users[loginNum], passes[loginNum], codes[loginNum], function(err) {
                Dota2.launch();
                Dota2.on("ready", function() {
                    getReplayUrl(job, cb)
                })
            })
        } else {
            console.log("[DOTA] requesting replay %s", match.match_id)
            // Try to get replay for 10 sec, else give up and try again later.
            var timeOut = setTimeout(function() {
                Dota2.exit()
                Steam.logOff()
                Steam = new steam.SteamClient()
                Dota2 = new dota2.Dota2Client(Steam, false)
                console.log("[DOTA] request for replay timed out.")
                return cb("STEAM TIMEOUT")
            }, 10000)
            Dota2.matchDetailsRequest(match.match_id, function(err, data) {
                var url = "http://replay" + data.match.cluster + ".valve.net/570/" + match.match_id + "_" + data.match.replaySalt + ".dem.bz2";
                clearTimeout(timeOut);
                //Add url to job so we don't need to check again.
                job.data['url'] = url
                job.update()
                return cb(null, url)
            })
        }
    } else {
        getS3URL(match.match_id, function(err, url) {
            cb(err, url)
        })
    }
}

function getS3URL(match_id, cb) {
    if(process.env.AWS_S3_BUCKET) {
        var archiveName = match_id + ".dem.bz2"
        var s3 = new AWS.S3()
        var params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: archiveName
        }
        s3.headObject(params, function(err, data) {
            if(!err) {
                var url = s3.getSignedUrl('getObject', params);
                cb(null, url)
            } else {
                console.log("[S3] %s not in S3", match_id)
                cb("S3 UNAVAILABLE")
            }
        })
    } else {
        cb("S3 UNAVAILABLE")
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
        console.log("[S3] S3 not defined (skipping upload)")
        cb(null)
    }
}
/*
 * Parses a replay for a match
 */

function parseReplay(job, cb) {
    var match_id = job.data.match.match_id
    console.log("[PARSER] requesting parse for match %s", match_id)
    download(job, function(err, fileName) {
        if(err) {
            if(err === "S3 UNAVAILABLE") {
                return cb(null, err) //Mark as done
            }
            console.log("[PARSER] Error for match %s: %s", match_id, err)
            return cb(err)
        }
        console.log("[PARSER] running parse on %s", fileName)
        var output = ""
        var cp = spawn("java", ["-jar",
            parser_file,
            fileName,
            process.env.MONGOHQ_URL || "mongodb://localhost/dota"
        ])
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
            return cb(code)
        })
    })
}