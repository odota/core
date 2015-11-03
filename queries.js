var async = require('async');
var utility = require('./utility');
var convert64to32 = utility.convert64to32;
var queueReq = utility.queueReq;
var computePlayerMatchData = require('./compute').computePlayerMatchData;
var zlib = require('zlib');
var aggregator = require('./aggregator');
var reduceMatch = utility.reduceMatch;
var config = require('./config');
var constants = require('./constants');
var columnInfo = null;

function getSets(redis, cb) {
    async.parallel({
        /*
        "bots": function(cb) {
            redis.get("bots", function(err, bots) {
                bots = JSON.parse(bots || "[]");
                //sort list of bots descending, but full bots go to end (concentrates load)

                // bots.sort(function(a, b) {
                //     var threshold = 50;
                //     if (a.friends > threshold) {
                //         return 1;
                //     }
                //     if (b.friends > threshold) {
                //         return -1;
                //     }
                //     return (b.friends - a.friends);
                // });

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
        */
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

function getColumnInfo(db, cb) {
    if (columnInfo) {
        return cb();
    }
    else {
        async.parallel({
            "matches": function(cb) {
                db('matches').columnInfo().asCallback(cb);
            },
            "player_matches": function(cb) {
                db('player_matches').columnInfo().asCallback(cb);
            },
            "players": function(cb) {
                db('players').columnInfo().asCallback(cb);
            },
            "player_ratings": function(cb) {
                db('player_ratings').columnInfo().asCallback(cb);
            }
        }, function(err, results) {
            columnInfo = results;
            cb(err);
        });
    }
}

function insertMatch(db, redis, queue, match, options, cb) {
    var players = match.players ? JSON.parse(JSON.stringify(match.players)) : undefined;
    delete match.players;
    //options specify api, parse, or skill
    //we want to insert into matches, then insert into player_matches for each entry in players
    async.series([
    function(cb) {
      getColumnInfo(db, cb);
    },
    insertMatchTable,
    insertPlayerMatchesTable,
    //ensurePlayers,
    updatePlayerCaches,
    clearMatchCache
    ], decideParse);

    function insertMatchTable(cb) {
        var row = match;
        for (var key in row) {
            if (!(key in columnInfo.matches)) {
                delete row[key];
                //console.error(key);
            }
        }
        //TODO use psql upsert when available
        //upsert on api, update only otherwise
        if (options.type === "api") {
            db('matches').insert(row).where({
                match_id: row.match_id
            }).asCallback(function(err) {
                if (err && err.detail.indexOf("already exists") !== -1) {
                    //try update
                    db('matches').update(row).where({
                        match_id: row.match_id
                    }).asCallback(cb);
                }
                else {
                    cb(err);
                }
            });
        }
        else {
            db('matches').update(row).where({
                match_id: row.match_id
            }).asCallback(cb);
        }
    }

    function insertPlayerMatchesTable(cb) {
        //we can skip this if we have no players (skill case)
        async.each(players || [], function(pm, cb) {
            var row = pm;
            for (var key in row) {
                if (!(key in columnInfo.player_matches)) {
                    delete row[key];
                    //console.error(key);
                }
            }
            row.match_id = match.match_id;
            //TODO upsert
            //upsert on api, update only otherwise
            if (options.type === "api") {
                db('player_matches').insert(row).where({
                    match_id: row.match_id,
                    player_slot: row.player_slot
                }).asCallback(function(err) {
                    if (err && err.detail.indexOf("already exists") !== -1) {
                        db('player_matches').update(row).where({
                            match_id: row.match_id,
                            player_slot: row.player_slot
                        }).asCallback(cb);
                    }
                    else {
                        cb(err);
                    }
                });
            }
            else {
                db('player_matches').update(row).where({
                    match_id: row.match_id,
                    player_slot: row.player_slot
                }).asCallback(cb);
            }
        }, cb);
    }
    /**
     * Inserts a placeholder player into db with just account ID for each player in this match
     **/
    function ensurePlayers(cb) {
        async.each(players || [], function(p, cb) {
            insertPlayer(db, {
                account_id: p.account_id
            }, cb);
        }, cb);
    }

    function updatePlayerCaches(cb) {
        if (!config.ENABLE_PLAYER_CACHE){
            return cb();
        }
        var match_id = match.match_id;
        db.select().from('player_matches').where({
            "player_matches.match_id": Number(match_id)
        }).innerJoin('matches', 'player_matches.match_id', 'matches.match_id').orderBy("player_slot", "asc").asCallback(function(err, player_matches) {
            if (err) {
                return cb(err);
            }
            async.each(player_matches, function(player_match, cb) {
                if (player_match.account_id && player_match.account_id !== constants.anonymous_account_id) {
                    redis.get(new Buffer("player:" + player_match.account_id), function(err, result) {
                        if (err) {
                            return cb(err);
                        }
                        //if player cache doesn't exist, skip
                        var cache = result ? JSON.parse(zlib.inflateSync(result)) : null;
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
                            player_match = reduceMatch(player_match);
                            var identifier = [player_match.match_id, player_match.player_slot].join(':');
                            var orig = cache.data[identifier];
                            if (!orig) {
                                cache.data[identifier] = player_match;
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
                                redis.setex(new Buffer("player:" + player_match.account_id), Number(ttl) > 0 ? Number(ttl) : 24 * 60 * 60 * config.UNTRACK_DAYS, zlib.deflateSync(JSON.stringify(cache)));
                            });
                        }
                        return cb();
                    });
                }
                else {
                    return cb();
                }
            }, cb);
        });
    }

    function clearMatchCache(cb) {
        redis.del("match:" + match.match_id, cb);
    }

    function decideParse(err) {
        if (err) {
            return cb(err);
        }
        if (match.parse_status !== 0) {
            //not parsing this match
            //this isn't a error, although we want to report that we refused to parse back to user if it was a request
            return cb();
        }
        else {
            //queue it and finish, callback with the queued parse job
            return queueReq(queue, "parse", match, options, function(err, job2) {
                cb(err, job2);
            });
        }
    }
}

function insertPlayer(db, player, cb) {
    if (player.steamid) {
        //this is a login, compute the account_id from steamid
        player.account_id = Number(convert64to32(player.steamid));
    }
    if (!player.account_id || player.account_id === constants.anonymous_account_id) {
        return cb();
    }
    getColumnInfo(db, function(err) {
        if (err) {
            return cb(err);
        }
        var row = player;
        for (var key in row) {
            if (!(key in columnInfo.players)) {
                delete row[key];
                //console.error(key);
            }
        }
        //TODO upsert
        db('players').insert(row).asCallback(function(err) {
            if (err && err.detail.indexOf("already exists") !== -1) {
                db('players').update(row).where({
                    account_id: row.account_id
                }).asCallback(cb);
            }
            else {
                return cb();
            }
        });
    });
}

function insertPlayerRating(db, row, cb) {
    db('player_ratings').insert(row).asCallback(cb);
}
module.exports = {
    getSets: getSets,
    insertPlayer: insertPlayer,
    insertMatch: insertMatch,
    insertPlayerRating: insertPlayerRating
};
