var db = require('./db');
var async = require('async');
var redis = require('./redis').client;
var constants = require('./constants.json');
var config = require("./config");
var compute = require('./compute');
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var advQuery = require('./advquery');
var generatePositionData = compute.generatePositionData;
var computeMatchData = compute.computeMatchData;
var renderMatch = require('./renderMatch');
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
                    return cb(new Error("match not found"));
                }
                else {
                    fillPlayerNames(match.players, function(err) {
                        if (err) {
                            return cb(err);
                        }
                        computeMatchData(match);
                        renderMatch(match);
                        //Add to cache if latest parse version
                        if (match.parsed_data && match.parsed_data.version === constants.parser_version && config.NODE_ENV !== "development") {
                            redis.setex(key, 3600, JSON.stringify(match));
                        }
                        return cb(err, match);
                    });
                }
            });
        }
    });
}

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
    //options.query, the querystring from the user 
    //todo use the same query format as for /api/matches?
    //http://api.jquery.com/jQuery.param/
    //use jquery on the page to create the url string
    console.log(options.query);
    var select = {
        /*
        //elemmatch query allows getting specific hero+specific player with mongo only
        players: {
            $elemMatch: {
                account_id: player.account_id,
                hero_id: Number(options.query.hero_id) || {
                    $ne: null
                }
            }
        }
        */
        //todo get account id from query, or lock to querying on a player's matches?
        //could make it part of query, but disabled from editing?
        //kinda breaks DRY to have id both in query and in url?
        "players.account_id": player.account_id
    };
    //we want parsed_data if trends
    var project = (options.info === "trends") ? {
        start_time: 1,
        match_id: 1,
        cluster: 1,
        game_mode: 1,
        duration: 1,
        radiant_win: 1,
        parse_status: 1,
        first_blood_time: 1,
        lobby_type: 1,
        parsed_data: 1
    } : null;
    var filter = {};
    //should set filter.balanced unless query says not to
    if (options.query.balanced !== "0") {
        filter.balanced = 1;
    }
    options.query.hero_id = Number(options.query.hero_id);
    if (options.query.hero_id) {
        //getting only specific heroes played by this player
        filter.hero_id = options.query.hero_id;
    }
    //todo main profile page "recent matches" should include all matches, but aggregations shouldn't
    //use results.unfiltered?
    advQuery({
        select: select,
        project: project,
        filter: filter,
        agg: null, //null aggs everything by default 
    }, function(err, results) {
        if (err) {
            return cb(err);
        }
        player.aggData = results.aggData;
        player.matches = results.data;
        player.obs = player.aggData.obs.counts;
        player.sen = player.aggData.sen.counts;
        var d = {
            "obs": true,
            "sen": true
        };
        generatePositionData(d, player);
        player.posData = [d];
        var radiantMap = {}; //map whether the this player was on radiant for a particular match for efficient lookup later when doing teammates/matchups
        for (var i = 0; i < player.matches.length; i++) {
            var m = player.matches[i];
            var p = m.players[0];
            //map if player was on radiant for this match for efficient teammate check later
            radiantMap[m.match_id] = isRadiant(p);
        }
        player.radiantMap = radiantMap;
        var match_ids = player.matches.map(function(m) {
            return m.match_id;
        });
        //do the query for teammates/hero matchups
        computeMatchups(player, match_ids, function(err) {
            cb(err, player);
        });
    });
}

function computeMatchups(player, match_ids, cb) {
    console.time("db2");
    db.matches.find({
        match_id: {
            $in: match_ids
        }
    }, {
        fields: {
            "players.account_id": 1,
            "players.hero_id": 1,
            "players.player_slot": 1,
            match_id: 1,
            radiant_win: 1,
            game_mode: 1,
            lobby_type: 1
        }
    }, function(err, docs) {
        if (err) {
            return cb(err);
        }
        console.timeEnd("db2");
        //compute stats that require iteration through all players in a match
        var teammates = {};
        player.heroes = {};
        for (var hero_id in constants.heroes) {
            var obj = {
                hero_id: hero_id,
                games: 0,
                win: 0,
                with_games: 0,
                with_win: 0,
                against_games: 0,
                against_win: 0
            };
            player.heroes[hero_id] = obj;
        }
        for (var i = 0; i < docs.length; i++) {
            var match = docs[i];
            var playerRadiant = player.radiantMap[match.match_id];
            var player_win = (playerRadiant === match.radiant_win);
            for (var j = 0; j < match.players.length; j++) {
                var tm = match.players[j];
                var tm_hero = tm.hero_id;
                if (isRadiant(tm) === playerRadiant) {
                    //count teammate players
                    if (!teammates[tm.account_id]) {
                        teammates[tm.account_id] = {
                            account_id: tm.account_id,
                            win: 0,
                            games: 0
                        };
                    }
                    teammates[tm.account_id].games += 1;
                    teammates[tm.account_id].win += player_win ? 1 : 0;
                    //count teammate heroes
                    if (tm_hero in player.heroes) {
                        if (tm.account_id === player.account_id) {
                            //console.log("self %s", tm_hero);
                            player.heroes[tm_hero].games += 1;
                            player.heroes[tm_hero].win += player_win ? 1 : 0;
                        }
                        else {
                            //console.log("teammate %s", tm_hero);
                            player.heroes[tm_hero].with_games += 1;
                            player.heroes[tm_hero].with_win += player_win ? 1 : 0;
                        }
                    }
                }
                else {
                    //count enemy heroes
                    if (tm_hero in player.heroes) {
                        //console.log("opp %s", tm_hero);
                        player.heroes[tm_hero].against_games += 1;
                        player.heroes[tm_hero].against_win += player_win ? 1 : 0;
                    }
                }
            }
        }
        player.heroes_arr = [];
        for (var id in player.heroes) {
            var hc = player.heroes[id];
            player.heroes_arr.push(hc);
        }
        player.heroes_arr.sort(function(a, b) {
            return b.games - a.games;
        });
        player.teammates = [];
        for (var id in teammates) {
            var count = teammates[id];
            id = Number(id);
            if (id !== constants.anonymous_account_id && id !== player.account_id && count.games >= 3) {
                player.teammates.push(count);
            }
        }
        player.teammates.sort(function(a, b) {
            return b.games - a.games;
        });
        console.time('teammate_lookup');
        fillPlayerNames(player.teammates, function(err) {
            console.timeEnd('teammate_lookup');
            cb(err);
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