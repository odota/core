var async = require('async');
var utility = require('./utility');
var convert64to32 = utility.convert64to32;
var queueReq = utility.queueReq;
var queries = require('./queries');
var computeMatchData = require('./compute').computeMatchData;
var zlib = require('zlib');
var aggregator = require('./aggregator');
var reduceMatch = utility.reduceMatch;
var config = require('./config');

function fillPlayerNames(db, players, cb) {
    //we want
    /*
                "account_id": 1,
            "last_visited": 1,
            "personaname": 1,
            "avatar": 1
            */
//join players with player table by account_id to find their names

}


function getSets(redis, cb) {
    async.parallel({
        "bots": function(cb) {
            redis.get("bots", function(err, bots) {
                bots = JSON.parse(bots || "[]");
                //sort list of bots descending, but full bots go to end (concentrates load)
                /*
                bots.sort(function(a, b) {
                    var threshold = 50;
                    if (a.friends > threshold) {
                        return 1;
                    }
                    if (b.friends > threshold) {
                        return -1;
                    }
                    return (b.friends - a.friends);
                });
                */
                //sort ascending (distributes load)
                bots.sort(function(a, b) {
                    return a.friends - b.friends;
                });
                cb(err, bots);
            });
        },
        "ratingPlayers": function(cb) {
            redis.get("ratingPlayers", function(err, rps) {
                cb(err, JSON.parse(rps || "{}"));
            });
        },
        "trackedPlayers": function(cb) {
            redis.get("trackedPlayers", function(err, tps) {
                cb(err, JSON.parse(tps || "{}"));
            });
        },
        "userPlayers": function(cb) {
            redis.get("userPlayers", function(err, ups) {
                cb(err, JSON.parse(ups || "{}"));
            });
        },
        "donators": function(cb) {
            redis.get("donators", function(err, ds) {
                cb(err, JSON.parse(ds || "{}"));
            });
        }
    }, function(err, results) {
        cb(err, results);
    });
}

function insertMatch(db, redis, queue, match, options, cb) {
    //options specify api or parse 
    //TODO don't want to overwrite parse_status: 2 (parsed) (e.g., if an existing parsed match is expired when re-requested)
    //insert the match into db, then based on the existing document determine whether to do aggregations
    //this is likely somewhat messed up in production already, although we could run a script to clean it up
    db.matches.findAndModify({
        match_id: match.match_id
    }, {
        $set: match
    }, {
        //don't upsert if inserting skill data
        upsert: options.type !== "skill",
        //explicitly declare we want the pre-modification document in the cb
        "new": false
    }, function(err, doc) {
        if (err) {
            return cb(err);
        }
        //clear match cache
        redis.del("match:" + match.match_id, function(err) {
            if (err) {
                return cb(err);
            }
            if (options.type === "skill" && !doc) {
                //we didn't add skill data because we didn't have this match in db, return immediately
                return cb(err);
            }
            async.each(match.players || options.players, function(p, cb) {
                    //full cache
                    /*
                    var match_copy = JSON.parse(JSON.stringify(match));
                    if (options.type !== "skill") {
                        //m.players[0] should be this player
                        //m.all_players should be all players
                        //duplicate this data into a copy to avoid corrupting original match object
                        match_copy.all_players = match.players.slice(0);
                        match_copy.players = [p];
                        //computeMatchData takes the parsed_data and creates a parsedPlayer for each player in a parallel array
                        computeMatchData(match_copy);
                        reduceMatch(match_copy);
                    }
                    db.player_matches.update({
                        account_id: p.account_id,
                        match_id: match_copy.match_id
                    }, {
                        $set: match_copy
                    }, {
                        upsert: true
                    }, function(err) {
                        if (err) {
                            return cb(err);
                        }
                        return queries.insertPlayer(db, p, cb);
                    });
                    */
                    //aggregate cache
                    redis.get("player:" + p.account_id, function(err, result) {
                        if (err) {
                            return cb(err);
                        }
                        //if player cache doesn't exist, skip
                        var cache = result ? JSON.parse(zlib.inflateSync(new Buffer(result, 'base64'))) : null;
                        if (cache) {
                            var m = JSON.parse(JSON.stringify(match));
                            if (options.type !== "skill") {
                                //m.players[0] should be this player
                                //m.all_players should be all players
                                //duplicate this data into a copy to avoid corrupting original match object
                                m.all_players = match.players.slice(0);
                                m.players = [p];
                                var reInsert = match.match_id in cache.aggData.match_ids && options.type === "api";
                                var reParse = match.match_id in cache.aggData.parsed_match_ids && options.type === "parsed";
                                if (!reInsert && !reParse) {
                                    //some data fields require computeMatchData in order to aggregate correctly
                                    computeMatchData(m);
                                    m.players.forEach(function(player, i) {
                                        player.parsedPlayer = m.parsedPlayers ? m.parsedPlayers[i] : {};
                                    });
                                    //do aggregations on fields based on type		
                                    cache.aggData = aggregator([m], options.type, cache.aggData);
                                }
                            }
                            //reduce match to save cache space--we only need basic data per match for matches tab
                            reduceMatch(m);
                            var orig = cache.data[m.match_id];
                            if (!orig) {
                                cache.data[m.match_id] = m;
                            }
                            else {
                                for (var key in m) {
                                    orig[key] = m[key];
                                }
                            }
                            redis.ttl("player:" + p.account_id, function(err, ttl) {
                                if (err) {
                                    return cb(err);
                                }
                                redis.setex("player:" + p.account_id, Number(ttl) > 0 ? Number(ttl) : 24 * 60 * 60 * config.UNTRACK_DAYS, zlib.deflateSync(JSON.stringify(cache)).toString('base64'));
                            });
                        }
                        return queries.insertPlayer(db, p, cb);
                        //return cb();
                    });
                },
                //done with all 10 players
                function(err) {
                    if (err) {
                        return cb(err);
                    }
                    if (err) {
                        return cb(err);
                    }
                    if (match.parse_status !== 0) {
                        //not parsing this match
                        //this isn't a error, although we want to report that we refused to parse back to user if it was a request
                        return cb(err);
                    }
                    else {
                        if (match.request) {
                            //process requests with higher priority, one attempt only
                            match.priority = "high";
                            match.attempts = 1;
                        }
                        //queue it and finish
                        return queueReq(queue, "parse", match, function(err, job2) {
                            cb(err, job2);
                        });
                    }
                });
        });
    });
}

function insertMatchProgress(db, redis, queue, match, options, job, cb) {
    insertMatch(db, match, options, function(err, job2) {
        if (err) {
            return cb(err);
        }
        if (!job2) {
            //succeeded in API, but cant parse this replay
            job.progress(100, 100, "This replay is unavailable.");
            cb();
        }
        else {
            //wait for parse to finish
            job.progress(0, 100, "Parsing replay...");
            //request, parse and log the progress
            job2.on('progress', function(prog) {
                job.progress(prog, 100);
            });
            job2.on('failed', function(err) {
                cb(err);
            });
            job2.on('complete', function() {
                job.progress(100, 100, "Parse complete!");
                redis.setex("requested_match:" + match.match_id, 60 * 60 * 24, "1");
                cb();
            });
        }
    });
}

function insertPlayer(db, player, cb) {
    player.account_id = player.account_id || Number(convert64to32(player.steamid));
    db('players').columnInfo().then(function(info) {
        var row = {};
        for (var key in info) {
            row[key] = player[key];
        }
        //TODO implement upsert to avoid crashing on duplicate inserts
        db.insert(row).into('players').asCallback(function(err) {
            return cb(err, row);
        });
    });
}
module.exports = {
    getSets: getSets,
    fillPlayerNames: fillPlayerNames,
    insertPlayer: insertPlayer,
    insertMatch: insertMatch,
    insertMatchProgress: insertMatchProgress
};
