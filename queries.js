var async = require('async');
var utility = require('./utility');
var convert64to32 = utility.convert64to32;
var queueReq = utility.queueReq;
var queries = require('./queries');
var computePlayerMatchData = require('./compute').computePlayerMatchData;
var zlib = require('zlib');
var aggregator = require('./aggregator');
var reduceMatch = utility.reduceMatch;
var config = require('./config');

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
    var players = match.players;
    delete match.players;
    //options specify api, parse, or skill
    //we want to insert into matches, then insert into player_matches for each entry in match.players
    async.series([insertMatchTable, insertPlayerMatchesTable, ensurePlayers, updatePlayerCaches, clearMatchCache], decideParse);

    function insertMatchTable(cb) {
        var row = match;
        for (var key in row) {
            if (typeof row[key] === "object" && row[key]) {
                row[key] = JSON.stringify(row[key]);
            }
        }
        //TODO support upsert
        //TODO update only, do not insert if type is skill
        db.insert(row).into('matches').where({
            match_id: match.match_id
        }).asCallback(cb);
    }

    function insertPlayerMatchesTable(cb) {
        //we can skip this if we have no players (skill case)
        async.each(players || [], function(pm, cb) {
            var row = pm;
            row.match_id = match.match_id;
            for (var key in row) {
                if (typeof row[key] === "object" && row[key]) {
                    row[key] = JSON.stringify(row[key]);
                }
            }
            //TODO support upsert
            db.insert(row).into('player_matches').where({
                match_id: match.match_id,
                player_slot: pm.player_slot
            }).asCallback(cb);
        }, cb);
    }

    function ensurePlayers(cb) {
        async.each(players || [], function(p, cb) {
            queries.insertPlayer(db, p, cb);
        }, cb);
    }

    function updatePlayerCaches(cb) {
        async.each(players || options.players, function(player_match, cb) {
            //put match fields into each player to form player_match
            for (var key in match) {
                player_match[key] = match[key];
            }
            redis.get("player:" + player_match.account_id, function(err, result) {
                if (err) {
                    return cb(err);
                }
                //if player cache doesn't exist, skip
                var cache = result ? JSON.parse(zlib.inflateSync(new Buffer(result, 'base64'))) : null;
                if (cache) {
                    if (options.type !== "skill") {
                        var reInsert = player_match.match_id in cache.aggData.match_ids && options.type === "api";
                        var reParse = player_match.match_id in cache.aggData.parsed_match_ids && options.type === "parsed";
                        if (!reInsert && !reParse) {
                            computePlayerMatchData(player_match);
                            var group = {};
                            group[player_match.match_id] = players;
                            cache.aggData = aggregator([player_match], group, options.type, cache.aggData);
                        }
                    }
                    //reduce match to save cache space--we only need basic data per match for matches tab
                    reduceMatch(player_match);
                    var orig = cache.data[player_match.match_id];
                    if (!orig) {
                        cache.data[player_match.match_id] = player_match;
                    }
                    else {
                        //iterate instead of setting directly to avoid clobbering existing data
                        for (var key in player_match) {
                            orig[key] = player_match[key];
                        }
                    }
                    redis.ttl("player:" + player_match.account_id, function(err, ttl) {
                        if (err) {
                            return cb(err);
                        }
                        redis.setex("player:" + player_match.account_id, Number(ttl) > 0 ? Number(ttl) : 24 * 60 * 60 * config.UNTRACK_DAYS, zlib.deflateSync(JSON.stringify(cache)).toString('base64'));
                    });
                }
                return cb();
            });
        }, cb);
    }

    function clearMatchCache(cb) {
        redis.del("match:" + match.match_id, cb);
    }

    function decideParse(err, cb) {
        if (err) {
            return cb(err);
        }
        if (match.parse_status !== 0) {
            //not parsing this match
            //this isn't a error, although we want to report that we refused to parse back to user if it was a request
            return cb();
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
    }
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
        //TODO support upsert to avoid crashing on duplicate inserts
        db.insert(row).into('players').asCallback(function(err) {
            return cb(err, row);
        });
    });
}

function insertPlayerRating(db, rating, cb) {
    db('player_ratings').columnInfo().then(function(info) {
        var row = {};
        for (var key in row) {
            row[key] = rating[key];
        }
        db.insert(row).into('player_ratings').asCallback(cb);
    });
}
module.exports = {
    getSets: getSets,
    insertPlayer: insertPlayer,
    insertMatch: insertMatch,
    insertMatchProgress: insertMatchProgress,
    insertPlayerRating: insertPlayerRating
};
