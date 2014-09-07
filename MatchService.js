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
var q = async.queue(download, 1);

poll()

/**
 * Generates Match History URL
 */
function generateGetMatchHistoryURL(account_ID, num) {
    num = 3
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
/*
 * Polls the WebAPI for new matches and adds them to db
 */
function poll() {
    //TODO use a db instead of array here
    var account_ids = ["102344608", "88367253","71313111","75392401"];
    async.mapSeries(account_ids, getNewGames, function(err){
        if (err) {throw err}
        //queue matches needing more details
        matches.find({parse_status: {$lt: 1}}, function(err, docs) {
            docs.forEach(function(doc){
                matches.update({match_id: doc.match_id}, {$set: {parse_status : 1}})

                q.push(doc, function (err) {
                    console.log('[UPDATE] finished processing match %s', doc.match_id); 
                })
            })
            console.log('[UPDATE] There are %s matches in the queue', q.length())
        })
        setTimeout(poll, 5000)
    })
}

/**
 * Makes request for match history and puts new games in db
 */
function getNewGames(player_id, cb) {
    console.log("[POLL] getting games for player %s", player_id)
    request(generateGetMatchHistoryURL(player_id), function(err, res, body){
        if (err) {throw err}
        else{
            async.mapSeries(JSON.parse(body).result.matches, insertMatch, function(err){
                cb(null)
            })
        }
    })
}

function insertMatch(match, cb){
    var match_id = match.match_id
    matches.findOne({match_id: match_id}, function(err, data) {
        if (err) {cb(err)}
        else{
            if (!data) {
                console.log("[POLL] getting details for match %s", match_id)
                request(generateGetMatchDetailsURL(match_id), function(err, res, body){
                    if (err) {cb(err)}
                    else{
                        var result = JSON.parse(body).result
                        result.parse_status = 0;
                        matches.insert(result);
                        cb(null)
                    }
                })
            }
            else{
                cb(null)
            }
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
                console.log("[DL] GC not ready, match %s, retrying", id)
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
        parse(fileName, function(err){
            cb(null);
        })
    }
    else{
        //TODO don't try if the replay is too old, right now this blocks forever
        console.log("[DL] no existing replay for match %s", match_id)
        getReplayUrl(match_id, function(err, url){
            downloadWithRetry(url, 1000, function(err, fileName){
                console.log("[DL] saved replay to %s", fileName)
                parse(fileName, function(err){
                    cb(null);
                })
            })
        })
    }
}

function downloadWithRetry(url, timeout, cb){
    var fileName = "./replays/"+url.substr(url.lastIndexOf("/") + 1).slice(0, -4);
    console.log('[DL] Downloading file from %s', url)
    var dl = request({url:url, encoding:null}, function (error, response, body) {
        if (response.statusCode !== 200 || error) {
            console.log("[DL] failed to download from %s, retrying in %ds", url, timeout/1000)
            setTimeout(downloadWithRetry, timeout, url, timeout*2, cb);
        }
        else{
            var data = Bunzip.decode(body);
            fs.writeFileSync(fileName, data);
            cb(null, fileName);
        }
    })
    }

/*
 * Parses the given file
 */
function parse(fileName, cb){
    var match_id = path.basename(fileName).split("_")[0]    
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
        //TODO output of parse should go here
        //TODO insert data from stdout into database
        console.log('[PARSER] stdout: %s', data);
    });

    cp.stderr.on('data', function (data) {
        console.log('[PARSER] stderr: %ss', data);
    });

    cp.on('close', function (code) {
        if (code == 0){
            //TODO maybe delete/move the replay file if code 0
            //also mark matches with parse status 2
            matches.update({match_id: match_id}, {$set: {parse_status : 2}})   
        }      
        console.log('[PARSER] exited with code %s', code);
        cb(null)
    });     
}