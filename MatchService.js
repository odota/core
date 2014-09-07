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
var gq = async.queue(getMatchDetails, 1)
var dq = async.queue(download, 1);
var pq = async.queue(parse, 1);
var replay_dir = process.env.REPLAY_DIR || "./replays/"
var parserFile = process.env.PARSER_FILE || "./parser/target/stats-0.1.0.jar";
var num_matches = 2

matches.update( { parse_status: { $mod: [ 2, 1 ] }} , { $inc: { parse_status: -1 } }, { multi: true } )
setInterval(poll, 10000)

/*
 * Polls the WebAPI for new matches and adds them to db
 */
function poll() {
    //parse_status
    //0 = just inserted into db from match history
    //1 = queued for match details
    //2 = got match details
    //3 = queued for download
    //4 = downloaded
    //5 = queued for parse
    //6 = all done

    //TODO use a db instead of array here
    var account_ids = ["102344608", "88367253","71313111","75392401"];

    //TODO control rate at which gethistory requests are made
    async.mapSeries(account_ids, getNewGames, function(err){})

    matches.find({}, function(err, docs) {
        docs.forEach(function(doc){
            if (doc.parse_status == 0){
                matches.update({match_id: doc.match_id}, {$set: {parse_status : 1}})
                gq.push(doc, function (err) {
                    if (!err){
                        matches.update({match_id: doc.match_id}, {$set: {parse_status : 2}})  
                    }
                })
            }
            if (doc.parse_status == 2){
                matches.update({match_id: doc.match_id}, {$set: {parse_status : 3}})
                dq.push(doc, function (err) {
                    if (!err){
                        matches.update({match_id: doc.match_id}, {$set: {parse_status : 4}})
                    }
                })
            }
            if (doc.parse_status == 4){
                matches.update({match_id: doc.match_id}, {$set: {parse_status : 5}})
                pq.push(doc, function (err) {
                    if (!err){
                        matches.update({match_id: doc.match_id}, {$set: {parse_status : 6}})
                    }
                })
            }
        })
        console.log('[STATUS] There are %s matches in the getMatchDetails queue', gq.length())
        console.log('[STATUS] There are %s matches in the download queue', dq.length())
        console.log('[STATUS] There are %s matches in the parse queue', pq.length())
    })
}

function getNewGames(player_id, cb) {
    console.log("[POLL] getting games for player %s", player_id)
    request(generateGetMatchHistoryURL(player_id, num_matches), function(err, res, body){
        if (err) {cb(err)}
        else if (res.statusCode != 200){
            cb("WebAPI response status != 200");
        }
        else{
            var result = JSON.parse(body).result
            async.mapSeries(result.matches, insertMatch, function(err){
                cb(null)
            })
        }
    })
}

function insertMatch(match, cb){
    matches.findOne({match_id: match.match_id}, function(err, data) {
        if (err) {cb(err)}
        else{
            if (!data) {
                match.parse_status = 0;
                matches.insert(match);
            }
            cb(null)
        }})
}

function getMatchDetails(match, cb){
    var match_id = match.match_id
    console.log("[DETAILS] getting details for match %s", match_id)
    request(generateGetMatchDetailsURL(match_id), function(err, res, body){
        if (err) {cb(err)}
        else if (res.statusCode != 200){
            cb("WebAPI response status != 200");
        }
        else{
            var result = JSON.parse(body).result
            matches.update({match_id: match.match_id}, {$set: result})  
            cb(null)
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
                    result.file_name = "./replays/"+result.replay_url.substr(result.replay_url.lastIndexOf("/") + 1).slice(0, -4);
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
 * Downloads replay file for match
 */
function download(match, cb) {
    var match_id = match.match_id

    var fileList = fs.readdirSync(replay_dir)
    for (var i =0;i<fileList.length;i++){
        if (fileList[i].split("_")[0]==match_id){
            console.log("[DL] found existing replay for match %s", match_id)
            matches.update({match_id: match_id}, {$set: {file_name:replay_dir+fileList[i]}})
            return (cb(null));
        }
    }
    if (match.start_time < moment().subtract(7, 'days').format('X')){
        console.log("[DL] replay file expired")
        //TODO maybe set some status for this so it doesnt keep trying
        cb("expired")
    }  
    else{
        getReplayUrl(match_id, function(err, url){
            downloadWithRetry(url, 1000, function(err, fileName){
                cb(null)
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
            console.log("[DL] saved replay to %s", fileName)
            fs.writeFileSync(fileName, data);
            cb(null, fileName);
        }
    })
    }

/*
 * Parses the given file
 */
function parse(match, cb){
    var fileName = match.file_name
    var match_id = match.match_id

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
        console.log('[PARSER] stderr: %s', data);
    });

    cp.on('close', function (code) {
        console.log('[PARSER] exited with code %s', code);
        //TODO maybe delete/move replay if successful
        cb(code)
    });     
}

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