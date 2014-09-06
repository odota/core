var request = require('request'),
    path = require("path"),
    fs = require("fs"),
    http = require('http'),
    Steam = require("./MatchProvider-steam").MatchProvider,
    spawn = require('child_process').spawn,
    constants = require('./constants.json'),
    moment = require('moment'),
    Bunzip = require('seek-bzip'),
    matches = require('./util').db.get('matchStats');

var steam = new Steam(
    process.env.STEAM_USER,
    process.env.STEAM_PASS,
    process.env.STEAM_NAME,
    process.env.STEAM_GUARD_CODE,
    process.env.STEAM_RESPONSE_TIMEOUT);

matches.index('match_id', {unique: true});
setInterval(getMatches, constants.match_poll_interval);

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
    console.log("requestGetMatchHistory called")
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
    console.log("requestGetMatchDetails called")
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
function tryToGetReplayUrl(id, cb) {
    matches.findOne({match_id: id}, function(err, data){
        // Error occurred
        if (err) {
            cb(err)
        }
        // Already have the replay url
        if (data.replay_url) {
            cb(false, data.replay_url, parse)
        } 
        else{
            if (steam.ready) {
                steam.getMatchDetails(id, function(err, data) {
                    if (!err && data) {
                        console.log(data)
                        var result={};
                        result.replay_url = util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt);
                        result.salt = data.salt
                        matches.update({match_id: id}, {$set: result})
                        cb(false, result.replay_url, parse)
                    }
                    else {
                        console.log("Error occurred during match details request")
                        cb(true)
                    }
                })
            } 
            else {
                console.log("steam is not ready")
                cb(true)
            }
        }
    })
}

/**
 * Downloads replay file from specified url
 */
function download(err, url, cb) {
    if (err){ return; }
    var fileName = "./replays/"+url.substr(url.lastIndexOf("/") + 1).slice(0,-4);
    if (!fs.existsSync(fileName)){
        fs.openSync(fileName, 'w')
        console.log('Downloading file from %s', url)
        http.get(url, function(res) {
            if (res.statusCode !== 200) {
                console.log("[DL] failed to download from %s", url)
                return;
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
                var decomp= Bunzip.decode(buf);
                console.log('[DL] writing decompressed file %s', fileName);
                fs.writeFileSync(fileName, decomp);
                cb(fileName);
            });
        });    
    }
    else{
        //file already exists, don't parse this
        //it could be in mid-parse/mid-download
        //use the utility to re-parse all present files
        console.log("%s already exists", fileName)
    }

}

function parse(fileName){
    var parserFile = "./parser/target/stats-0.1.0.jar";

    console.log("[PARSER] starting parse: %s", fileName);
    var cp = spawn(
        "java",
        ["-jar",
         parserFile,
         fileName
        ]
    );

    cp.stdout.on('data', function (data) {
        //TODO JSON output of parse should output here
        console.log('[PARSER] stdout: %s - %s', data, fileName);
    });

    cp.stderr.on('data', function (data) {
        console.log('[PARSER] stderr: %s - %s', data, fileName);
    });

    cp.on('close', function (code) {
        //TODO insert data from stdout into database
        //maybe delete/move the replay file too
        console.log('[PARSER] exited with code %s - %s', code, fileName);
    }); 
}

function getMatches() {
    //TODO add a trackedUsers database to determine users to follow
    var account_ids = ["102344608", "88367253"];
    account_ids.forEach(function(id) {
        requestGetMatchHistory(id, 10);
    });
    parseNewReplays();
}

function parseNewReplays() {
    var cutoff = moment().subtract(7, 'days').format('X')
    console.log ("Looking for unparsed games since %s", cutoff);
    matches.find({"playerNames": {$exists:false}},{"start_time":{ $gt: cutoff }}, function(err, docs){
        if (err) throw err;
        else {
            console.log('Found %s matches needing parse', docs.length);
            docs.forEach(function(doc, i) {
                console.log(doc.match_id)
                tryToGetReplayUrl(doc.match_id, download);
            })
        }
    });
}