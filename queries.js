var db = require('./db');
var async = require('async');
var redis = require('./redis').client;
var constants = require('./constants.json');
var config = require("./config");
var compute = require('./compute');
var advQuery = require('./advquery');
var utility = require('./utility');
var generatePositionData = utility.generatePositionData;
var computeMatchData = compute.computeMatchData;
var renderMatch = compute.renderMatch;
//readies a match for display
function prepareMatch(match_id, cb) {
    var key = "match:" + match_id;
    redis.get(key, function(err, reply) {
        if (!err && reply) {
            console.log("Cache hit for match " + match_id);
            try {
                var match = JSON.parse(reply);
                return cb(err, match);
            }
            catch (e) {
                return cb(e);
            }
        }
        else {
            console.log("Cache miss for match " + match_id);
            db.matches.findOne({
                match_id: Number(match_id)
            }, function(err, match) {
                if (err || !match) {
                    return cb("match not found");
                }
                else {
                    fillPlayerRatingsMatch(match, function(err) {
                        if (err) {
                            return cb(err);
                        }
                        fillPlayerNames(match.players, function(err) {
                            if (err) {
                                return cb(err);
                            }
                            computeMatchData(match);
                            renderMatch(match);
                            //Add to cache if match is parsed
                            //TODO: this prevents reparses from showing immediately
                            if (match.parse_status === 2 && config.NODE_ENV !== "development") {
                                redis.setex(key, 3600, JSON.stringify(match));
                            }
                            return cb(err, match);
                        });
                    });
                }
            });
        }
    });
}

function fillPlayerRatingsMatch(match, cb) {
        //joins the players in a match with their rating at the time
        //for each player, get the first rating where match_id is lte this match
        async.each(match.players, function(p, cb) {
            db.ratings.findOne({
                account_id: p.account_id,
                match_id: {
                    $lte: match.match_id
                }
            }, {
                sort: {
                    time: -1
                }
            }, function(err, doc) {
                if (err || !doc) {
                    return cb(err);
                }
                p.soloCompetitiveRank = doc.soloCompetitiveRank;
                p.competitiveRank = doc.competitiveRank;
                cb(err);
            });
        }, function(err) {
            cb(err);
        });
    }
    /*
    function fillPlayerRatingsCurrent(players, cb) {
    //joins an array of players with their current rating
        async.each(players, function(p, cb) {
            db.ratings.findOne({
                account_id: p.account_id
            }, {
                sort: {
                    time: -1
                }
            }, function(err, doc) {
                if (err || !doc) {
                    return cb(err);
                }
                p.soloCompetitiveRank = doc.soloCompetitiveRank;
                p.competitiveRank = doc.competitiveRank;
                cb(err);
            });
        }, function(err) {
            cb(err);
        });
    }
    */
function fillPlayerNames(players, cb) {
    //make hash of account_ids to players
    //use $in query to get these players from db
    //loop through results and join with players by hash
    //iterate back through original array to get back players in order
    var player_hash = {};
    players.forEach(function(p) {
        player_hash[p.account_id] = p;
    });
    var player_ids = players.map(function(p) {
        return p.account_id;
    });
    db.players.find({
        account_id: {
            $in: player_ids
        }
    }, function(err, docs) {
        if (err) {
            return cb(err);
        }
        docs.forEach(function(d) {
            var player = player_hash[d.account_id];
            if (player && d) {
                for (var prop in d) {
                    player[prop] = d[prop];
                }
            }
        });
        players = players.map(function(p) {
            return player_hash[p.account_id];
        });
        cb(err);
    });
}

function getSets(cb) {
    async.parallel({
        "bots": function(cb) {
            redis.get("bots", function(err, bots) {
                bots = JSON.parse(bots || "[]");
                //sort list of bots descending, but full bots go to end
                bots.sort(function(a, b) {
                    var threshold = 100;
                    if (a.friends > threshold) {
                        return 1;
                    }
                    if (b.friends > threshold) {
                        return -1;
                    }
                    return (b.friends - a.friends);
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
        }
    }, function(err, results) {
        cb(err, results);
    });
}

function getRatingData(account_id, cb) {
    db.ratings.find({
        account_id: account_id
    }, {
        sort: {
            time: -1
        }
    }, function(err, docs) {
        cb(err, docs);
    });
}

function fillPlayerData(player, options, cb) {
    //received from controller
    //options.info, the tab the player is on
    //options.query, the querystring from the user, pass these as select conditions
    //defaults: this player, balanced modes only, put the defaults in options.query
    var default_select = {
        "players.account_id": player.account_id.toString(),
        "balanced": "1"
    };
    for (var key in default_select) {
        options.query[key] = options.query[key] || default_select[key];
    }
    //null aggs everything by default (trends page), otherwise, we don't want parsed_data
    var agg = (options.info === "trends") ? null : {};
    advQuery({
        select: options.query,
        project: null, //just project default fields
        js_agg: agg,
        js_sort: {
            match_id: -1
        }
    }, function(err, results) {
        if (err) {
            return cb(err);
        }
        player.matches = results.data;
        player.aggData = results.aggData;
        if (player.aggData.obs) {
            //generally position data function is used to generate heatmap data for each player in a natch
            //we use it here to generate a single heatmap for aggregated counts
            player.obs = player.aggData.obs.counts;
            player.sen = player.aggData.sen.counts;
            var d = {
                "obs": true,
                "sen": true
            };
            generatePositionData(d, player);
            player.posData = [d];
        }
        //get teammates, heroes, convert hashes to arrays and sort them
        player.heroes_arr = [];
        var matchups = player.aggData.matchups;
        for (var id in matchups) {
            var h = matchups[id];
            player.heroes_arr.push(h);
        }
        player.heroes_arr.sort(function(a, b) {
            return b.games - a.games;
        });
        player.teammates = [];
        var teammates = player.aggData.teammates;
        for (var id in teammates) {
            var tm = teammates[id];
            id = Number(id);
            //don't include if anonymous, the player himself, or if less than 3 games
            if (id !== constants.anonymous_account_id && id !== player.account_id && tm.games >= 3) {
                player.teammates.push(tm);
            }
        }
        player.teammates.sort(function(a, b) {
            return b.games - a.games;
        });
        console.time('teammate_lookup');
        fillPlayerNames(player.teammates, function(err) {
            console.timeEnd('teammate_lookup');
            cb(err, player);
        });
    });
}
module.exports = {
    fillPlayerData: fillPlayerData,
    fillPlayerNames: fillPlayerNames,
    getRatingData: getRatingData,
    getSets: getSets,
    prepareMatch: prepareMatch
};
