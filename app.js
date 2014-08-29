// var http = require('http'),
//     path = require('path'),
//     util = require("util"),
var request = require('request'),
    path = require("path"),
    fs = require("fs"),
    http = require('http'),
    Steam = require("./MatchProvider-steam").MatchProvider,
    MongoDB = require("./MatchProvider-mongodb").MatchProvider,
    spawn = require('child_process').spawn,
    config = require("./config");

var steam = new Steam(
        config.steam_user,
        config.steam_pass,
        config.steam_name,
        config.steam_guard_code,
        config.cwd,
        config.steam_response_timeout),
    mongodb = new MongoDB(config.mongodb_host, config.mongodb_port),
    baseURL = "https://api.steampowered.com/IDOTA2Match_570/",
    matchCount = config.matchCount,
    missingReplays = []

/**
 * Gets Match History URL
 */
function generateGetMatchHistoryURL(account_ID, num) {
    return baseURL + "GetMatchHistory/V001/?key=" + config.steam_api_key
    + (account_ID != "undefined" ? "&account_id=" + account_ID : "")
    + (num != "undefined" ? "&matches_requested=" + num : "");
}

function generateGetMatchDetailsURL(match_id) {
    return baseURL + "GetMatchDetails/V001/?key=" + config.steam_api_key
    + "&match_id=" + match_id;
}

function requestGetMatchHistory(id, num) {
    console.log("requestGetMatchHistory called at " + (new Date()).toString())
    request(generateGetMatchHistoryURL(id, num), function(err, res, body){
        if (!err && res.statusCode == 200) {
            var j = JSON.parse(body);
            j.result.matches.forEach(function(match, i) {
                mongodb.findByMatchId(match.match_id, function(err, data) {
                    if (err) throw err
                    if (!data) {
                        setTimeout(requestGetMatchDetails, i * 1000, match.match_id)
                    }
                })
            })
        }
    })
}

function requestGetMatchDetails(id) {
    console.log("requestGetMatchDetails called at " + (new Date()).toString())
    request(generateGetMatchDetailsURL(id), function(err, res, body){
        if (!err && res.statusCode == 200) {
            var result = JSON.parse(body).result
            mongodb.save(result, function(err, cb){})
       		tryToGetReplay(id)
        }
    })
}

function tryToGetReplay(id) {
    if (steam.ready) {
        steam.getMatchDetails(id, function(err, data) {
            if (!err && data) {
                var result= {};
                result.replay_url = util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt);
                result.salt = data.salt
                
                console.log(result.replay_url);
                
				var missing = missingReplays.indexOf(id)
                
                if (missing) {
                	missingReplays.splice(missing, 1);
                }
                
                mongodb.updateMatch(id, result, function(err, data){
                });

                var fileName = result.replay_url.substr(result.replay_url.lastIndexOf("/") + 1)
                console.log("filename: " + fileName);

                downloadFile(result.replay_url, fileName, function() {
                    console.log("decompressing file " + fileName)
                    var bz = spawn("bzip2", ["-d", config.replaysFolder + fileName]);
                    
                    bz.stdout.on('data', function (data) {
                        console.log('stdout: ' + data);
                    });

                    bz.stderr.on('data', function (data) {
                        console.log('stderr: ' + data);
                    });
                    
                    bz.on('exit', function() {
                        console.log("finished decompressing " + fileName)
                        var cp = spawn(
                            "java",
                            ["-jar", "../StatsParsing/target/stats-0.1.0.jar", config.replaysFolder + path.basename(fileName, ".bz2")]
                        );
                        
                        cp.stdout.on('data', function (data) {
                            console.log('stdout: ' + data);
                        });

                        cp.stderr.on('data', function (data) {
                            console.log('stderr: ' + data);
                        });

                        cp.on('close', function (code) {
                            console.log('child process exited with code ' + code);
                        });        
                    })    
                })
            }

        })
    } else {
        var missing = missingReplays.indexOf(id)
                
        if (!missing) {
            missingReplays.push(id)
        	console.log(missingReplays)
        }
    }
}

function downloadFile(url, fileName, callback) {
    var file = fs.createWriteStream(config.replaysFolder + fileName)
    console.log("downloading file " + fileName)
    http.get(url, function(res) {
        res.pipe(file);
        file.on('finish', function() {
            console.log("finished download " + fileName)
            file.close(callback);
        })
    });
}

function getMatches() {
    config.account_ids.forEach(function(id, i) {
        setTimeout(requestGetMatchHistory, (i + 1) * 1000 * matchCount, id, matchCount);
    })
    
    setTimeout(getMatches, config.account_ids.length + 1 * 1000 * matchCount + 1000);
}

setTimeout(getMatches, 5000);

// app.get('/tools/matchurls', function(req, res){
//     var matchId = req.query.matchid;
//     if (!matchId) {
//         // No match ID, display regular index.
//         res.render('index', { title: 'match urls!' });
//         res.end();
//     }
//     else {
//         if (!isNaN(matchId) && parseInt(matchId, 10) < 1024000000000) {
//             matchId = parseInt(matchId, 10);

//             mongodb.findByMatchId(matchId, function(err, data) {
//                 if (err) throw err;

//                 if (data) {
//                     // We have this appid data already in mongodb, so just serve from there.
//                     res.render('index', {
//                         title: 'match urls!',
//                         matchid: matchId,
//                         replayState: data.state,
//                         replayUrl: util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt)
//                     });
//                     res.end();
//                 }
//                 else if (steam.ready) {
//                     // We need new data from Dota.
//                     steam.getMatchDetails(matchId, function(err, data) {
//                         if (err) {
//                             res.render('index', {
//                                 title: 'match urls!',
//                                 error: err
//                             });
//                             res.end();
//                         }
//                         else {
//                             // Save the new data to Mongo
//                             mongodb.save(data, function(err, cb){});

//                             res.render('index', {
//                                 title: 'match urls!',
//                                 matchid: matchId,
//                                 replayState: data.state,
//                                 replayUrl: util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt)
//                             });
//                             res.end();
//                         }
//                     });

//                     // If Dota hasn't responded by 'request_timeout' then send a timeout page.
//                     setTimeout(function(){
//                         res.render('index', {
//                             title: 'match urls!',
//                             error: "timeout"
//                         });
//                         res.end();
//                     }, config.request_timeout);
//                 }
//                 else {
//                     // We need new data from Dota, and Dota is not ready.
//                     res.render('index', {
//                         title: 'match urls!',
//                         error: "notready"
//                     });
//                     res.end();
//                 }
//             });
//         }
//         else {
//             // Match ID failed validation.
//             res.render('index', {
//                 title: 'match urls!',
//                 error: "invalid"
//             });
//             res.end();
//         }
//     }
// });