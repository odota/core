var request = require('request'),
    path = require("path"),
    fs = require("fs"),
    http = require('http'),
    Steam = require("./MatchProvider-steam").MatchProvider,
    db = require('monk')('localhost/dota'),
    spawn = require('child_process').spawn,
    winston = require('winston'),
    Mail = require('winston-mail').Mail,
    config = require("./config");

var steam = new Steam(
        config.steam_user,
        config.steam_pass,
        config.steam_name,
        config.steam_guard_code,
        config.cwd,
        config.steam_response_timeout),
    logger = new (winston.Logger)
    matches = db.get('matchStats'),
    baseURL = "https://api.steampowered.com/IDOTA2Match_570/",
    matchCount = config.matchCount;

logger.add(
    winston.transports.Console,
    {
        timestamp: true
    }
)

logger.add(
    winston.transports.File,
    {
        filename: config.logFile,
        level: "info"
    }
)

logger.add(
    Mail,
    {
        to: config.logEmail,
        level: "error"
	}
)

/**
 * Generates Match History URL
 */
function generateGetMatchHistoryURL(account_ID, num) {
    return baseURL + "GetMatchHistory/V001/?key=" + config.steam_api_key
    + (account_ID != "undefined" ? "&account_id=" + account_ID : "")
    + (num != "undefined" ? "&matches_requested=" + num : "");
}

/**
 * Generates Match Details URL
 */
function generateGetMatchDetailsURL(match_id) {
    return baseURL + "GetMatchDetails/V001/?key=" + config.steam_api_key
    + "&match_id=" + match_id;
}

/**
 * Makes request for match history
 */
function requestGetMatchHistory(id, num) {
    logger.log("info", "requestGetMatchHistory called")
    request(generateGetMatchHistoryURL(id, num), function(err, res, body){
        if (!err && res.statusCode == 200) {
            var j = JSON.parse(body);
            j.result.matches.forEach(function(match, i) {
                matches.findOne({match_id: match.match_id}, function(err, data) {
                    if (err) throw err
                    if (!data) {
                        setTimeout(requestGetMatchDetails, i * 1000, match.match_id)
                    }
                })
            })
        }
    })
}

/**
 * Makes request for match details
 */
function requestGetMatchDetails(id) {
    logger.log("info", "requestGetMatchDetails called")
    request(generateGetMatchDetailsURL(id), function(err, res, body){
        if (!err && res.statusCode == 200) {
            var result = JSON.parse(body).result
            matches.insert(result).success(function(){
                setTimeout(tryToGetReplayUrl, 120000, id, downloadFile)
            })
        }
    })
}

/**
 * Gets replay URL, either from steam or from database if we already have it
 */
function tryToGetReplayUrl(id, callback) {
    matches.findOne({match_id: id}, function(err, data){
        if (err) callback(err)
        
        if (data.replay_url) {
            callback(null, data.replay_url)
        } else {
            if (steam.ready) {
                steam.getMatchDetails(id, function(err, data) {
                    if (!err && data) {
                        var result= {};
                        result.replay_url = util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt);
                        result.salt = data.salt
                        matches.update({match_id: id}, {$set: result}, function(){})
                        callback(null, replay.replay_url)
                    } else {
                        callback(true)
                    }
                })
            } else {
                callback(true)
            }
        }
    })    
}

/**
 * Decompresses the bzip2 replay file and then sends file to parser
 */
function decompressAndParseReplay(err, fileName) {
    if (!err) {
        var bz = spawn("bzip2", ["-d", config.replaysFolder + fileName]);

        bz.stdout.on('data', function (data) {
            logger.log('info', '[BZ] stdout: %s - %s', data, fileName);
        });

        bz.stderr.on('data', function (data) {
            logger.log('error', '[BZ] error: %s - %s', data, fileName);
        });

        bz.on('exit', function() {
            logger.log("info", "[BZ] finished decompressing %s", fileName)
            var cp = spawn(
                "java",
                ["-jar",
                 "stats-0.1.0.jar",
                 config.replaysFolder + path.basename(fileName, ".bz2")
                ]
            );

            cp.stdout.on('data', function (data) {
                logger.log('info', '[PARSER] stdout: %s - %s', data, fileName);
            });

            cp.stderr.on('data', function (data) {
                logger.log('error', '[PARSER] error: %s - %s', data, fileName);
            });

            cp.on('close', function (code) {
                logger.log('info', '[PARSER] exited with code %s - %s', code, fileName);
            });        
        })    

    }
}

/**
 * Downloads replay file from specified url
 */
function downloadFile(err, url) {
    if (err) decompressAndParseReplay(true)
    else {
    	var fileName = url.substr(url.lastIndexOf("/") + 1)
        var file = fs.createWriteStream(config.replaysFolder + fileName)
        logger.log('info', 'Trying to download file from %s, named %s', url, fileName)
        http.get(url, function(res) {
            if (res.statusCode !== 200) {
                logger.log("warn", "[DL] failed to download %s", fileName)
                decompressAndParseReplay(true)
            }
            res.pipe(file);
            file.on('finish', function() {
                logger.log('info', 'File downloaded - %s', fileName)
                file.close(decompressAndParseReplay(false, fileName));
            })
        });    
    }
}

function getMatches() {
    config.account_ids.forEach(function(id, i) {
        setTimeout(requestGetMatchHistory, (i + 1) * 1000 * matchCount, id, matchCount);
    })
    
    setTimeout(getMatches, config.account_ids.length + 1 * 1000 * matchCount + 1000);
}

function getMissingReplays() {
    logger.log('info', 'Trying to find missing replays.');
    matches.find({"playerNames": {$exists:false}}, {"sort": ['match_id', 'desc'], "limit": 10}, function(err, docs){
        if (err) throw err;
        else {
            logger.log('info', 'Found %s matches needing replay parsing.', docs.length);
            docs.forEach(function(doc, i) {
                if (doc.replay_url) setTimeout(downloadFile, i*5000, false, doc.replay_url)
                else {
                    setTimeout(tryToGetReplayUrl, i*5000, doc.match_id, downloadFile)
                }
            })
        }
    });
}

setTimeout(getMatches, 5000)
setInterval(getMissingReplays, 30000)