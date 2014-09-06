var request = require('request'),
    path = require("path"),
    fs = require("fs"),
    async = require("async"),
    gc = require("./GameController").MatchProvider,
    spawn = require('child_process').spawn,
    constants = require('./constants.json'),
    moment = require('moment'),
    Bunzip = require('seek-bzip'),
    matches = require('./util').matches;
var steam = new gc(
    process.env.STEAM_USER,
    process.env.STEAM_PASS,
    process.env.STEAM_GUARD_CODE);

poll();

/**
 * Generates Match History URL
 */
function generateGetMatchHistoryURL(account_ID, num) {
    num=6;
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
    var account_ids = ["102344608", "88367253","71313111","75392401"];
    async.mapSeries(account_ids, getNewGames, function(err){
        //after adding new games to db, check db for matches needing more data and without expired replay 
        var cutoff = moment().subtract(7, 'days').format('X'); 
        matches.find({"playerNames": {$exists:false}},{"start_time":{ $gt: cutoff }}, function(err, matches){
            if (err) {throw err}
            else{
                console.log('[DB] Found %s matches to process newer than %s', matches.length, moment.unix(cutoff).format('MMMM Do YYYY, h:mm:ss a'));
                //TODO runs horizontally right now, switch to vertical
                async.mapLimit(matches, 1, getMatchDetails, function(err, detailedIds){
                    async.mapLimit(matches, 1, download, function(err, fileNames){
                        async.mapLimit(fileNames, 1, parse, function(err){
                            setTimeout(poll, 5000);
                        })
                    })
                })
            }
        })
    })
}

/**
 * Makes request for match history and puts new games in db
 */
function getNewGames(player_id, cb) {
    console.log("[API] getting games for player %s", player_id)
    request(generateGetMatchHistoryURL(player_id), function(err, res, body){
        if (err) {cb(err)}
        else{
            JSON.parse(body).result.matches.forEach(function(match){
                matches.findOne({match_id: match.match_id}, function(err, data) {
                    if (!data) {
                        matches.insert(match);
                    }
                })
            })
            cb(null)
        }
    })
}

/**
 * Adds more details to db
 */
function getMatchDetails(match, cb){
    var match_id = match.match_id
    console.log("[API] getting details for match %s", match.match_id)
    request(generateGetMatchDetailsURL(match_id), function(err, res, body){
        if (err) {cb(err)}
        else{
            var result = JSON.parse(body).result
            matches.update({match_id: match_id}, {$set: result})
            cb(null, match_id)
        }
    })
}

/**
 * Get the replay url for this match, callback with it
 */
function getReplayUrl(id, cb) {
    matches.findOne({match_id: id}, function(err, data){
        if (data.replay_url) {
            console.log("[DL] found replay_url in db")
            cb(null, data.replay_url)
        }
        else{
            if (steam.ready) {
                steam.getReplayDetails(id, function(err, data) {
                    if (err) {cb(err);}
                    var result={};
                    result.replay_url = "http://replay"+data.cluster+".valve.net/570/"+data.id+"_"+data.salt+".dem.bz2";
                    result.replay_salt = data.salt
                    matches.update({match_id: id}, {$set: result})
                    console.log("[DL] got replay_url from GC")
                    cb(null, result.replay_url)
                })
            } 
            else {
                console.log("[GC] Steam not ready for match %s, retrying", id)
                setTimeout(getReplayUrl, 10000, id, cb);
            }
        }
    })
}

/**
 * Downloads replay file for match, callback with the file name
 */
function download(match, cb) {
    var match_id = match.match_id
    var fileList = fs.readdirSync("./replays/")
    var fileName;
    for (var i =0;i<fileList.length;i++){
        if (fileList[i].split("_")[0]==match_id){
            console.log("[DL] found existing replay for match %s", match_id)
            fileName = "./replays/"+fileList[i];
        }
    }
    if (fileName){
        cb(null, fileName);
    }
    else{
        console.log("[DL] no existing replay for match %s", match_id)
        getReplayUrl(match_id, function(err, url){
            downloadWithRetry(url, 1000, function(err, fileName){
                console.log("[DL] downloaded and decompressed to %s", fileName)
                cb(null, fileName)
            })
        })
    }
}

function downloadWithRetry(url, timeout, cb){
    var fileName = "./replays/"+url.substr(url.lastIndexOf("/") + 1).slice(0, -4);
    console.log('[DL] Downloading file from %s', url)
    var dl = request({url:url, encoding:null}, function (error, response, body) {
        if (response.statusCode !== 200) {
            console.log("[DL] failed to download from %s, retrying in %ds", url, timeout/1000)
            setTimeout(downloadWithRetry, timeout, url, timeout*2, cb);
        }
        else{
            var data = Bunzip.decode(body);
            fs.writeFileSync(fileName, data);
        }
    })
    }

/*
 * Parses the given file
 */
function parse(fileName, cb){
    var match_id = path.basename(fileName).split("_")[0]
    var result = {}
    result.playerNames={}
    matches.update({match_id: match_id}, {$set: result})

    var parserFile = "./parser/target/stats-0.1.0.jar";

    console.log("[PARSER] Parsing replay %s", fileName);
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
        cb(null)
    }); 
}