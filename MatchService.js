var request = require('request'),
    path = require("path"),
    fs = require("fs"),
    async = require("async"),
    Steam = require("./MatchProvider").MatchProvider,
    spawn = require('child_process').spawn,
    moment = require('moment'),
    Bunzip = require('seek-bzip'),
    matches = require('./util').matches;
players = require('./util').players;
var steam = new Steam(
    process.env.STEAM_USER,
    process.env.STEAM_PASS,
    process.env.STEAM_GUARD_CODE);
var aq = async.queue(apiRequest, 1)
var pq = async.queue(parseReplay, 1)
var api_url = "https://api.steampowered.com/IDOTA2Match_570/"
var replay_dir = process.env.REPLAY_DIR || "./replays/"
var parserFile = process.env.PARSER_FILE || "./parser/target/stats-0.1.0.jar";
var num_matches = process.env.MATCHES_PER_PLAYER || 1

if (process.env.RESET_ON_START){
    console.log("[RESET] resetting parse status")
    matches.update({}, {$set:{parse_status: 0}}, { multi: true })
}
setInterval(poll, 5000)

function poll() {
    players.find({}, function(err,docs){
        aq.push(docs, function(err){})
    })
    matches.find({}, function(err, docs) {
        if (err){throw err}
        docs.forEach(function(doc){
            if (doc.parse_status == 0){
                matches.update({match_id: doc.match_id}, {$set: {parse_status : 1}})
                pq.push(doc, function (err) {
                    if (!err){
                        matches.update({match_id: doc.match_id}, {$set: {parse_status : 2}})
                    }
                })
            }
        })
    })
    console.log('[QUEUES] %s api, %s parse', aq.length(), pq.length())
}

function apiRequest(req, cb){
    if (req.match_id){
        var url = generateGetMatchDetailsURL(req.match_id)
        }
    else if (req.player_id){
        var url = generateGetMatchHistoryURL(req.player_id, num_matches)
        }
    request(url, function(err, res, body){
        if (err) {cb(err)}
        else if (res.statusCode != 200){
            cb("WebAPI response code != 200");
        }
        else{
            var result = JSON.parse(body).result
            if (req.player_id){
                console.log("[API] games for user %s", req.player_id)
                result.matches.forEach(function(match){
                    matches.findOne({ match_id: match.match_id }, function(err, doc) {
                        if (err) {cb(err)}
                        if(!doc){
                            aq.push(match, function(err){})
                        }
                    })
                })
                cb(null)
            }
            else if (req.match_id){
                console.log("[API] details for match %s", req.match_id)
                result.parse_status = 0;
                matches.insert(result)
                cb(null)
            }

        }
    })
}

/**
 * Get the replay url for this match, callback with it
 */
function getReplayUrl(id, cb) {
    matches.findOne({match_id: id}, function(err, match){
        if (err){cb(err)}
        else{
            if (match.replay_url) {
                cb(null, match.replay_url)
            }
            else{
                if (steam.ready) {
                    steam.getReplayDetails(id, function(err, data) {
                        if (err) {cb(err);}
                        var result={};
                        result.replay_url = "http://replay"+data.cluster+".valve.net/570/"+data.id+"_"+data.salt+".dem.bz2";
                        matches.update({match_id: id}, {$set: result})
                        cb(null, result.replay_url)
                    })
                } 
                else {
                    console.log("[DL] GC not ready, match %s, retrying", id)
                    setTimeout(getReplayUrl, 10000, id, cb);
                }
            }   
        }

    })
}

function download(match, cb) {
    var match_id = match.match_id
    var fileName = replay_dir+match_id+".dem"
    if (!fs.existsSync(fileName)){
        if (match.start_time < moment().subtract(8, 'days').format('X')){
            cb("[DL] replay file expired for match %s", match_id)
        }
        else{
            getReplayUrl(match_id, function(err, url){
                downloadWithRetry(url, fileName, 1000, function(data){
                    fs.writeFileSync(fileName, data);
                    cb(null, fileName)
                })
            })
        }
    }
    else{        
        console.log("[DL] found existing replay for match %s", match_id)
        cb(null, fileName);
    }
}

function downloadWithRetry(url, fileName, timeout, cb){
    console.log('[DL] Downloading file from %s', url)
    var dl = request({url:url, encoding:null}, function (error, response, body) {
        if (response.statusCode !== 200 || error) {
            console.log("[DL] failed to download from %s, retrying in %ds", url, timeout/1000)
            setTimeout(downloadWithRetry, fileName, timeout, url, timeout*2, cb);
        }
        else{
            var data = Bunzip.decode(body);
            cb(data);
        }
    })
    }

function parseReplay(match, cb){
    var match_id = match.match_id
    download(match, function(err, fileName){
        console.log("[PARSER] Parsing replay %s", fileName);
        var output="";
        var cp = spawn(
            "java",
            ["-jar",
             parserFile,
             fileName
            ])
        cp.stdout.on('data', function (data) {
            output+=data
        })
        cp.stderr.on('data', function (data) {
            console.log('[PARSER] stderr: %s', data);
        })
        cp.on('close', function (code) {
            if (!code){
                matches.update({match_id: match_id}, {$set: JSON.parse(output)})
            }
            console.log('[PARSER] exited with code %s', code);
            cb(code)
        });    
    })
}

/**
 * Generates Match History URL
 */
function generateGetMatchHistoryURL(account_ID, num) {
    return api_url + "GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY
    + (account_ID != "undefined" ? "&account_id=" + account_ID : "")
    + (num != "undefined" ? "&matches_requested=" + num : "");
}

/**
 * Generates Match Details URL
 */
function generateGetMatchDetailsURL(match_id) {
    return api_url + "GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY
    + "&match_id=" + match_id;
}