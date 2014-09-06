var request = require('request'),
    path = require("path"),
    fs = require("fs"),
    async = require("async"),
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

setInterval(poll, constants.match_poll_interval);

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

function poll() {
    //TODO use a db instead of array here
    var account_ids = ["102344608", "88367253"];
    async.mapSeries(account_ids, getNewGames, function(err){
        console.log ("Looking for unparsed games since %s", moment().subtract(7, 'days').format('X'));
        matches.find({"playerNames": {$exists:false}},{"start_time":{ $gt: cutoff }}, function(err, docs){
            console.log('Found %s matches needing parse', docs.length);
            async.mapLimit(docs, 10, download, function(err, results){
                async.mapLimit(results, 1, parse, function(err, results){})
            })
        })

    })
});
}

/**
 * Makes request for match history and puts new games in db
 */
function getNewGames(player_id, cb) {
    console.log("requestGetMatchHistory for %s", player_id)
    request(generateGetMatchHistoryURL(player_id), function(err, res, body){
        if (!err && res.statusCode == 200) {
            var j = JSON.parse(body);
            async.mapSeries(j.result.matches, insertMatch, function(err, results){
                console.log(results);
            })

        }
    })
}

/**
 * Inserts a new match into the db if it doesn't exist
 */
function insertMatch(match, cb){
    matches.findOne({match_id: match.match_id}, function(data) {
        if (!data) {
            console.log("requestGetMatchDetails for %s", match_id)
            request(generateGetMatchDetailsURL(match_id), function(err, res, body){
                if (!err && res.statusCode == 200) {
                    var result = JSON.parse(body).result
                    matches.insert(result);
                    cb(null, match_id)
                }
            })
        }
    })
}

/**
 * Get the replay url for this match, callback with it
 */
function getReplayUrl(id, cb) {
    matches.findOne({match_id: id}, function(err, data){
        // Error occurred
        if (err) {
            cb(err);
        }
        // Already have the replay url
        if (data.replay_url) {
            cb(null, data.replay_url)
        } 
        else{
            if (steam.ready) {
                steam.getReplayDetails(id, function(err, data) {
                    if (!err && data) {
                        console.log(data)
                        var result={};
                        result.replay_url = "http://replay"+data.cluster+".valve.net/570/"+data.match_id+"_"+data.replay_salt+".dem.bz2";
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
                console.log("Steam is not ready")
                cb(true)
            }
        }
    })
}

/**
 * Downloads replay file for match, callback with the file name
 */
function download(match, cb) {
    var match_id = match.match_id
    getReplayUrl(match_id, function(err, url){
        if (err){
            cb(err);
        }
        var fileName = "./replays/"+url.substr(url.lastIndexOf("/") + 1).slice(0,-4);
        if (!fs.existsSync(fileName)){
            fs.openSync(fileName, 'w')
            console.log('[DL] Downloading file from %s', url)
            request({url:url, encoding:null}, function (error, response, body) {
                if (response.statusCode !== 200) {
                    console.log("[DL] failed to download from %s", url)
                    //TODO retry by timeout
                }
                var decomp= Bunzip.decode(body);
                console.log('[DL] writing decompressed file %s', fileName);
                fs.writeFileSync(fileName, decomp);
                parse(fileName);
            });
        }
        else{
            console.log("%s already exists", fileName)
            parse(fileName);
        }
    })
}

/*
 * Parses the given file
 */
function parse(fileName){
    //TODO get id from filename
    //TODO mark parsed
    var result = {}
    result.playerNames={}
    matches.update({match_id: id}, {$set: result})

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
        //TODO output of parse should output here
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