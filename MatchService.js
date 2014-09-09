var request = require('request'),
    path = require("path"),
    fs = require("fs"),
    async = require("async"),
    Steam = require("./MatchProvider").MatchProvider,
    spawn = require('child_process').spawn,
    moment = require('moment'),
    Bunzip = require('seek-bzip'),
    utility = require('./utility'),
    matches = utility.matches,
    players = utility.players,
    AWS = require('aws-sdk')

var steam = new Steam(
    process.env.STEAM_USER,
    process.env.STEAM_PASS,
    process.env.STEAM_GUARD_CODE);

var aq = async.queue(apiRequest, 1)
aq.empty = function(){
    getNewGames();
}
var pq = async.queue(parseReplay, 1)
var api_delay = 1000
var api_url = "https://api.steampowered.com/IDOTA2Match_570/"
var replay_dir = process.env.REPLAY_DIR || "replays/"
var parser_file = process.env.PARSER_FILE || "./parser/target/stats-0.1.0.jar"

//create replay directory
if (!fs.existsSync(replay_dir)){
    fs.mkdir(replay_dir)
}
//if env variable set, reparse all matches
if (process.env.RESET_ON_START){
    console.log("[RESET] resetting parse status")
    matches.update({}, {$set:{parse_status: 0}}, { multi: true })
}
//put any unparsed matches onto parse queue
matches.find({parse_status : 0}, function(err, docs) {
    pq.push(docs, function (err){})
})
getNewGames()

function getNewGames(){
    players.find({}, function(err,docs){
        aq.push(docs, function(err){})
    })
}

function apiRequest(req, cb){
    console.log('[QUEUES] %s api, %s parse', aq.length(), pq.length())
    utility.getData(generateURL(req), function(err, data){
        if (err) {return cb(err)}
        data = data.result
        if (req.player_id){
            console.log("[API] games for player %s", req.player_id)
            data.matches.forEach(function(match){
                matches.findOne({ match_id: match.match_id }, function(err, doc) {
                    if (err) {return cb(err)}
                    if(!doc){
                        aq.push(match, function(err){})
                    }
                })
            })
        }
        if (req.match_id){
            console.log("[API] details for match %s", req.match_id)
            data.parse_status = 0;
            matches.insert(data)
            pq.push(data, function(err){})
        }
        setTimeout(cb, api_delay, null)
    })
}

function download(match, cb) {
    var match_id = match.match_id
    var fileName = replay_dir+match_id+".dem"
    if (fs.existsSync(fileName)){
        console.log("[DL] found local replay for match %s", match_id)
        return cb(null, fileName);
    }
    if (process.env.AWS_S3_BUCKET){
        var s3 = new AWS.S3()
        var params = {Bucket: process.env.AWS_S3_BUCKET, Key: fileName}
        s3.getObject(params, function(err, data) {
            if (!err){
                console.log("[DL] found S3 replay for match %s", match_id)
                fs.writeFileSync(fileName, data.Body);
                return cb(null, fileName)
            }
        })
    }
    if (match.start_time > moment().subtract(8, 'days').format('X')){
        getReplayUrl(match, function(url){
            downloadWithRetry(url, fileName, 1000, function(){
                console.log("[DL] found steam replay for match %s", match_id)
                return cb(null, fileName)
            })
        })
    }
    else{
        console.log("[DL] replay expired for match %s", match_id);
        matches.update({match_id: match_id}, {$set: {parse_status : 1}})
        return cb(true)
    }
}

function getReplayUrl(match, cb){
    if (match.replay_url) { return cb(match.replay_url)}
    steam.getReplayDetails(match.match_id, function(err, data) {
        if (err) {
            console.log("[STEAM] steam not ready, retrying")
            setTimeout(getReplayUrl, 5000, match, cb)
        }
        else{
            var url = "http://replay"+data.cluster+".valve.net/570/"+data.id+"_"+data.salt+".dem.bz2";
            matches.update({match_id: match.match_id}, {$set: {replay_url:url}})
            cb(url)
        }
    })  
}

function downloadWithRetry(url, fileName, timeout, cb){
    console.log('[DL] Downloading replay from %s', url)
    request({url:url, encoding:null}, function (error, response, body) {
        if (response.statusCode !== 200 || error) {
            console.log("[DL] failed to download from %s, retrying in %ds", url, timeout/1000)
            setTimeout(downloadWithRetry, timeout, url, fileName, timeout*2, cb);
        }
        else{
            console.log("[DL] decompressing replay to %s", fileName)
            body = Bunzip.decode(body);  
            console.log("[DL] saving replay to %s", fileName)
            fs.writeFileSync(fileName, body);
            cb()
        }
    })
}

function parseReplay(match, cb){
    var match_id = match.match_id
    download(match, function(err, fileName){
        if (err) {
            return cb(err)
        }
        console.log("[PARSER] started on %s", fileName);
        var output="";
        var cp = spawn(
            "java",
            ["-jar",
             parser_file,
             fileName
            ])
        cp.stdout.on('data', function (data) {
            output+=data
        })
        cp.stderr.on('data', function (data) {
            console.log('[PARSER] match: %s, stderr: %s', match_id, data);
        })
        cp.on('close', function (code) {
            console.log('[PARSER] match: %s, exit code: %s', match_id, code);
            if (!code){
                matches.update({match_id: match_id}, {$set: JSON.parse(output)})
                matches.update({match_id: match_id}, {$set: {parse_status : 2}})
                if (process.env.AWS_S3_BUCKET){
                    var s3 = new AWS.S3()
                    var params = { Bucket: process.env.AWS_S3_BUCKET, Key: fileName, Body: fs.readFileSync(fileName)}
                    s3.putObject(params,function (err, data) {
                        if (!err){
                            console.log('[S3] Successfully uploaded replay to S3: %s ', fileName)
                            if (process.env.DELETE_REPLAY_FILES){
                                console.log("[DELETE] deleting replay: %s", fileName)
                                fs.unlink(fileName)
                            }
                            cb(code)
                        }
                    })
                }
            }
            else{
                cb(code)
            }
        })
    })
}

/**
 * Generates api request url
 */
function generateURL(req) {
    if (req.player_id){
        return api_url + "GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY
        + "&account_id=" + req.player_id
        + "&matches_requested=" + (process.env.MATCHES_PER_PLAYER || 10)
    }
    if (req.match_id){
        return api_url + "GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY
        + "&match_id=" + req.match_id;
    }
}
