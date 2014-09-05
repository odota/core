var request = require('request');
var path = require("path"),
    fs = require("fs"),
    http = require('http'),
    Steam = require("./MatchProvider-steam").MatchProvider,
    spawn = require('child_process').spawn,
    winston = require('winston'),
    steam = new Steam(
        process.env.STEAM_USER,
        process.env.STEAM_PASS,
        process.env.STEAM_NAME,
        process.env.STEAM_GUARD_CODE,
        process.env.STEAM_RESPONSE_TIMEOUT),
    logger = new (winston.Logger),
    util = require('./util'),
    constants = require('./constants.json'),
    matches = util.db.get('matchStats');

matches.index('match_id', {unique: true})

/**
 * Generates Match History URL
 */
function generateGetMatchHistoryURL(account_ID, num) {
    return constants.baseURL + "GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY
    + (account_ID != "undefined" ? "&account_id=" + account_ID : "")
    + (num != "undefined" ? "&matches_requested=" + num : "");
}

/**
 * Generates Match Details URL
 */
function generateGetMatchDetailsURL(match_id) {
    return constants.baseURL + "GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY
    + "&match_id=" + match_id;
}

/**
 * Makes request for match history
 */
function requestGetMatchHistory(player_id, num) {
    logger.log("info", "requestGetMatchHistory called")
    request(generateGetMatchHistoryURL(player_id, num), function(err, res, body){
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
function requestGetMatchDetails(match_id) {
    logger.log("info", "requestGetMatchDetails called")
    request(generateGetMatchDetailsURL(match_id), function(err, res, body){
        if (!err && res.statusCode == 200) {
            var result = JSON.parse(body).result
            matches.insert(result);
        }
    })
}

/**
 * Gets replay URL, either from steam or from database if we already have it
 */
function tryToGetReplayUrl(id, callback) {
    matches.findOne({match_id: id}, function(err, data){
        // Error occurred
        if (err) {
            callback(err)
        }
        // Already have the replay url
        if (data.replay_url) {
            callback(null, data.replay_url, parse)
        } 
        else{
            if (steam.ready) {
                steam.getMatchDetails(id, function(err, data) {
                    if (!err && data) {
                        var result= {};
                        result.replay_url = util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt);
                        result.salt = data.salt
                        matches.update({match_id: id}, {$set: result}, function(){})
                        callback(null, replay.replay_url)
                    } 
                    else {
                        // Something went wrong
                        callback(true)
                    }
                })
            } 
            else {
                // Steam's not ready
                callback(true)
            }
        }
    })
}

/**
 * Downloads replay file from specified url
 */
function download(err, url, cb) {
    if (err){ cb(err) }
    var fileName = "./replays/"+url.substr(url.lastIndexOf("/") + 1).slice(0,-4);
    if (!fs.existsSync(fileName)){
        logger.log('info', 'Downloading file from %s', url)
        http.get(url, function(res) {
            if (res.statusCode !== 200) {
                logger.log("warn", "[DL] failed to download from %s", url)
                cb(true, null)
            }

            var data = [], dataLen = 0; 

            res.on('data', function(chunk) {
                data.push(chunk);
                dataLen += chunk.length;
            }).on('end', function() {
                var buf = new Buffer(dataLen);

                for (var i=0, len = data.length, pos = 0; i < len; i++) { 
                    data[i].copy(buf, pos); 
                    pos += data[i].length; 
                } 

                var Bunzip = require('seek-bzip');
                var decomp= Bunzip.decode(buf);
                logger.log('info', '[DL] writing decompressed file');
                fs.writeFileSync(fileName, decomp);
                cb(false, fileName);
            });
        });    
    }
    else{
        //file already exists
        cb(false, fileName)
    }
}

function parse(err, fileName){
    if (err){
        console.log(err);
    } 
    var parserFile = "./parser/target/stats-0.1.0.jar";

    logger.log('info', "[PARSER] starting parse: %s", fileName);
    var cp = spawn(
        "java",
        ["-jar",
         parserFile,
         fileName
        ]
    );

    cp.stdout.on('data', function (data) {
        //JSON output of parse should output here
        logger.log('info', '[PARSER] stdout: %s - %s', data, fileName);
    });

    cp.stderr.on('data', function (data) {
        logger.log('error', '[PARSER] stderr: %s - %s', data, fileName);
    });

    cp.on('close', function (code) {
        //insert data from stdout into database
        //maybe delete/move the replay file too
        logger.log('info', '[PARSER] exited with code %s - %s', code, fileName);
    }); 
}

function getMatches() {
    //add a trackedUsers database to determine users to follow
    var account_ids = ["102344608", "88367253"];
    account_ids.forEach(function(id) {
        requestGetMatchHistory(id, 2);
    });
}

function parseNewReplays() {
    logger.log('info', 'Parsing replays for new matches.');
    // Currently identifies unparsed games by playerNames field
    //try only games within the last 7 days, otherwise replay expired
    matches.find({"playerNames": {$exists:false}}, {"sort": ['match_id', 'desc'], "limit": 10}, function(err, docs){
        if (err) throw err;
        else {
            logger.log('info', 'Found %s matches needing parse', docs.length);
            docs.forEach(function(doc, i) {
                tryToGetReplayUrl(doc.match_id, download);
            })
        }
    });
}

setInterval(getMatches, constants.match_poll_interval);
