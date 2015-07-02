var db = require('./db');
var compute = require('./compute');
var computeMatchData = compute.computeMatchData;
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var mergeObjects = utility.mergeObjects;
var helper = require('./helper');
var aggHeroes = helper.aggHeroes;
var aggTeammates = helper.aggTeammates;
var isSignificant = helper.isSignificant;
var async = require('async');

function advQuery(options, cb) {
    console.log("advquery: aggregating player page...");
    var default_project = {
        start_time: 1,
        match_id: 1,
        cluster: 1,
        game_mode: 1,
        duration: 1,
        radiant_win: 1,
        parse_status: 1,
        first_blood_time: 1,
        lobby_type: 1,
        leagueid: 1,
        radiant_name: 1,
        dire_name: 1,
        players: 1
    };
    options.project = options.project || default_project;
    //only project the fields we need
    options.project["players.account_id"] = 1;
    options.project["players.hero_id"] = 1;
    options.project["players.level"] = 1;
    options.project["players.kills"] = 1;
    options.project["players.deaths"] = 1;
    options.project["players.assists"] = 1;
    options.project["players.gold_per_min"] = 1;
    options.project["players.xp_per_min"] = 1;
    options.project["players.hero_damage"] = 1;
    options.project["players.tower_damage"] = 1;
    options.project["players.hero_healing"] = 1;
    options.project["players.player_slot"] = 1;
    options.project["players.last_hits"] = 1;
    options.project["players.denies"] = 1;
    options.project["players.leaver_status"] = 1;
    //select,the query received, build the mongo query and the filter based on this
    options.mongo_select = {};
    options.js_select = {};
    //default limit
    var max = 1000;
    //map to limit
    var mongoAble = {
        "players.account_id": 20000,
        "leagueid": max
    };
    for (var key in options.select) {
        if (options.select[key] === "" || options.select[key] === "all") {
            //using special keyword all since both "" and 0 evaluate to the same number and 0 is valid while "" is not
            delete options.select[key];
        }
        else {
            if (mongoAble[key]) {
                if (options.select[key] === "gtzero") {
                    options.mongo_select[key] = {
                        $gt: 0
                    };
                }
                else {
                    options.mongo_select[key] = Number(options.select[key]);
                }
                max = mongoAble[key];
            }
            else {
                //split each by comma
                if (options.select[key].toString().indexOf(",") !== -1) {
                    options.select[key] = options.select[key].split(",");
                }
                if (options.select[key].constructor === Array) {
                    //attempt to numberize each element
                    options.select[key] = options.select[key].map(function(e) {
                        return Number(e);
                    });
                }
                else {
                    //number just this element
                    options.select[key] = Number(options.select[key]);
                }
                options.js_select[key] = options.select[key];
            }
        }
    }
    //use mongodb to sort if selecting on indexed field
    if (!options.mongo_select["players.account_id"]) {
        options.sort = {
            "match_id": -1
        };
    }
    //js_agg, aggregations to do with js
    //do everything if null
    //this just gets the parsed data if js_agg is null (which means do everything)
    var bGetParsedPlayerData = Boolean(!options.js_agg);
    //limit, pass to mongodb, cap the number of matches to return in mongo
    options.limit = (!options.limit || options.limit > max) ? max : options.limit;
    //skip, pass to mongodb
    //sort, pass to mongodb
    //js_limit, the number of results to return in a page, filtered by js
    //js_start, the position to start a page at, selected by js
    //js_sort, post-process sorter that processes with js
    //build the monk hash
    var monk_options = {
        limit: options.limit,
        skip: options.skip,
        sort: options.sort,
        fields: options.project
    };
    console.time('querying database');
    // console.log(options);
    //TODO cache returned matches for "all"
    db.matches.find(options.mongo_select, monk_options, function(err, matches) {
        if (err) {
            return cb(err);
        }
        console.timeEnd('querying database');
        var expanded_matches = [];
        matches.forEach(function(m) {
            if (m.players) {
                //get all_players and primary player
                m.all_players = m.players.slice(0);
                //console.log(m.players.length, m.all_players.length);
                //use the mongodb select criteria to filter the player list
                //create a new match with this primary player
                //all players for tournament games, otherwise player matching select criteria
                m.players.forEach(function(p) {
                    var pass = true;
                    //check mongo query, if starting with player, this means we select a single player, otherwise select all players
                    for (var key in options.mongo_select) {
                        var split = key.split(".");
                        if (split[0] === "players" && p[split[1]] !== options.mongo_select[key]) {
                            pass = false;
                        }
                    }
                    if (pass) {
                        m.players = [p];
                        expanded_matches.push(JSON.parse(JSON.stringify(m)));
                    }
                });
            }
        });
        matches = expanded_matches;
        console.time("retrieving parsed data");
        getParsedPlayerData(matches, bGetParsedPlayerData, function(err) {
            if (err) {
                return cb(err);
            }
            console.timeEnd("retrieving parsed data");
            console.time('computing aggregations');
            matches.forEach(function(m) {
                //post-process the match to get additional stats
                computeMatchData(m);
            });
            var filtered = filter(matches, options.js_select);
            filtered = sort(filtered, options.js_sort);
            // console.log('aggData: options.js_agg = %s', options.js_agg);
            var aggData = aggregator(filtered, options.js_agg);
            var result = {
                aggData: aggData,
                page: filtered.slice(options.js_skip, options.js_skip + options.js_limit),
                data: filtered,
                unfiltered_count: matches.length
            };
            console.timeEnd('computing aggregations');
            cb(err, result);
        });
    });
}

function aggregator(matches, fields) {
    var aggData = {};
    var types = {
        "heroes": function(key, m, p) {
            aggHeroes(aggData.heroes, m);
        },
        "teammates": function(key, m, p) {
            aggTeammates(aggData.teammates, m);
        },
        "win": function(key, m, p) {
            aggData[key] += (m.player_win) ? 1 : 0;
        },
        "lose": function(key, m, p) {
            aggData[key] += (m.player_win) ? 0 : 1;
        },
        "games": function(key, m, p) {
            aggData[key] += 1;
        },
        "start_time": function(key, m, p) {
            standardAgg(key, m.start_time, m);
        },
        "duration": function(key, m, p) {
            standardAgg(key, m.duration, m);
        },
        "cluster": function(key, m, p) {
            standardAgg(key, m.cluster, m);
        },
        "region": function(key, m, p) {
            standardAgg(key, m.region, m);
        },
        "patch": function(key, m, p) {
            standardAgg(key, m.patch, m);
        },
        "first_blood_time": function(key, m, p) {
            standardAgg(key, m.first_blood_time, m);
        },
        "lobby_type": function(key, m, p) {
            standardAgg(key, m.lobby_type, m);
        },
        "game_mode": function(key, m, p) {
            standardAgg(key, m.game_mode, m);
        },
        "hero_id": function(key, m, p) {
            standardAgg(key, p.hero_id, m);
        },
        "level": function(key, m, p) {
            standardAgg(key, p.level, m);
        },
        //numeric values
        "kills": function(key, m, p) {
            standardAgg(key, p.kills, m);
        },
        "deaths": function(key, m, p) {
            standardAgg(key, p.deaths, m);
        },
        "assists": function(key, m, p) {
            standardAgg(key, p.assists, m);
        },
        "last_hits": function(key, m, p) {
            standardAgg(key, p.last_hits, m);
        },
        "denies": function(key, m, p) {
            standardAgg(key, p.denies, m);
        },
        "total_gold": function(key, m, p) {
            standardAgg(key, p.total_gold, m);
        },
        "total_xp": function(key, m, p) {
            standardAgg(key, p.total_xp, m);
        },
        "hero_damage": function(key, m, p) {
            standardAgg(key, p.hero_damage, m);
        },
        "tower_damage": function(key, m, p) {
            standardAgg(key, p.tower_damage, m);
        },
        "hero_healing": function(key, m, p) {
            standardAgg(key, p.hero_healing, m);
        },
        "courier_kills": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.courier_kills, m);
        },
        "tower_kills": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.tower_kills, m);
        },
        "neutral_kills": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.neutral_kills, m);
        },
        "buyback_count": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.buyback_count, m);
        },
        /*
        //no longer accurate in 6.84 due to ability to use wards from stack
        //alternatives include counting purchases or checking length of ward positions object
        "observer_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.observer_uses, m);
        },
        "sentry_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.sentry_uses, m);
        },
        */
        "stuns": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.stuns, m);
        },
        //per minute values
        "kills_per_min": function(key, m, p) {
            standardAgg(key, p.kills / (m.duration / 60), m);
        },
        "deaths_per_min": function(key, m, p) {
            standardAgg(key, p.deaths / (m.duration / 60), m);
        },
        "assists_per_min": function(key, m, p) {
            standardAgg(key, p.assists / (m.duration / 60), m);
        },
        "last_hits_per_min": function(key, m, p) {
            standardAgg(key, p.last_hits / (m.duration / 60), m);
        },
        "gold_per_min": function(key, m, p) {
            standardAgg(key, p.gold_per_min, m);
        },
        "xp_per_min": function(key, m, p) {
            standardAgg(key, p.xp_per_min, m);
        },
        "hero_damage_per_min": function(key, m, p) {
            standardAgg(key, p.hero_damage / (m.duration / 60), m);
        },
        "tower_damage_per_min": function(key, m, p) {
            standardAgg(key, p.tower_damage / (m.duration / 60), m);
        },
        "hero_healing_per_min": function(key, m, p) {
            standardAgg(key, p.hero_healing / (m.duration / 60), m);
        },
        //categorical values
        "leaver_status": function(key, m, p) {
            standardAgg(key, p.leaver_status, m);
        },
        "isRadiant": function(key, m, p) {
            standardAgg(key, isRadiant(p), m);
        },
        "lane": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.lane, m);
        },
        "lane_role": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.lane_role, m);
        },
        //lifetime ward positions
        "obs": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.obs, m);
        },
        "sen": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.sen, m);
        },
        //lifetime rune counts
        "runes": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.runes, m);
        },
        //lifetime item uses
        "item_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.item_uses, m);
        },
        //track sum of purchase times and counts to get average build time
        "purchase_time": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.purchase_time, m);
        },
        "purchase_time_count": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.purchase_time_count, m);
        },
        //lifetime item purchases
        "purchase": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.purchase, m);
        },
        "kills_count": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.kills, m);
        },
        "gold_reasons": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.gold_reasons, m);
        },
        "xp_reasons": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.xp_reasons, m);
        },
        //lifetime skill accuracy
        "ability_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.ability_uses, m);
        },
        "hero_hits": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.hero_hits, m);
        },
        "multi_kills": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.multi_kills, m);
        },
        "kill_streaks": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.kill_streaks, m);
        },
        "all_word_counts": function(key, m, p) {
            standardAgg(key, m.all_word_counts, m);
        },
        "my_word_counts": function(key, m, p) {
            standardAgg(key, m.my_word_counts, m);
        }
    };
    //if null fields passed in, do all aggregations
    fields = fields || types;
    //ensure aggData isn't null for each requested aggregation field
    for (var key in fields) {
        if (key === "win" || key === "lose" || key === "games") {
            aggData[key] = 0;
        }
        else if (key === "teammates" || key === "heroes") {
            aggData[key] = {};
        }
        else {
            aggData[key] = {
                sum: 0,
                min: Number.MAX_VALUE,
                max: 0,
                max_match: null,
                n: 0,
                counts: {},
                win_counts: {}
            };
        }
    }
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        var p = m.players[0];
        for (var key in fields) {
            //execute the aggregation function for each specified field
            if (types[key]) {
                types[key](key, m, p);
            }
        }
    }
    return aggData;

    function standardAgg(key, value, match) {
        var aggObj = aggData[key];
        if (typeof value === "undefined") {
            return;
        }
        aggObj.n += 1;
        if (typeof value === "object") {
            mergeObjects(aggObj.counts, value);
        }
        else {
            if (!aggObj.counts[value]) {
                aggObj.counts[value] = 0;
                aggObj.win_counts[value] = 0;
            }
            aggObj.counts[value] += 1;
            if (match.player_win) {
                aggObj.win_counts[value] += 1;
            }
            aggObj.sum += (value || 0);
            if (value < aggObj.min) {
                aggObj.min = value;
            }
            if (value > aggObj.max) {
                aggObj.max = value;
                aggObj.max_match = {
                    match_id: match.match_id,
                    start_time: match.start_time,
                    hero_id: match.players[0].hero_id
                };
            }
        }
    }
}

function filter(matches, filters) {
    //accept a hash of filters, run all the filters in the hash in series
    //console.log(filters);
    var conditions = {
        //filter: significant, remove unbalanced game modes/lobbies
        significant: function(m, key) {
            //console.log(m.match_id, m.game_mode, m.lobby_type, isSignificant(m));
            return Number(isSignificant(m)) === key;
        },
        //filter: player won
        win: function(m, key) {
            return Number(m.player_win) === key;
        },
        patch: function(m, key) {
            return m.patch === key;
        },
        game_mode: function(m, key) {
            return m.game_mode === key;
        },
        lobby_type: function(m, key) {
            return m.lobby_type === key;
        },
        hero_id: function(m, key) {
            return m.players[0].hero_id === key;
        },
        isRadiant: function(m, key) {
            return Number(m.players[0].isRadiant) === key;
        },
        //GETFULLPLAYERDATA: we need to iterate over match.all_players
        //ensure all array elements fit the condition
        //with_account_id: player id was also in the game
        with_account_id: function(m, key) {
            if (key.constructor !== Array) {
                key = [key];
            }
            return key.every(function(k) {
                return m.all_players.some(function(p) {
                    return p.account_id === k;
                });
            });
        },
        //teammate_hero_id
        teammate_hero_id: function(m, key) {
            if (key.constructor !== Array) {
                key = [key];
            }
            return key.every(function(k) {
                return m.all_players.some(function(p) {
                    return (p.hero_id === k && isRadiant(p) === isRadiant(m.players[0]));
                });
            });
        },
        //against_hero_id
        against_hero_id: function(m, key) {
                if (key.constructor !== Array) {
                    key = [key];
                }
                return key.every(function(k) {
                    return m.all_players.some(function(p) {
                        return (p.hero_id === k && isRadiant(p) !== isRadiant(m.players[0]));
                    });
                });
            }
            //TODO implement more filters
            //filter: specific regions
            //filter: endgame item
            //filter: no stats recorded (need to implement custom filter to detect)
            //filter kill differential
            //filter max gold/xp advantage
            //more filters from parse data
    };
    var filtered = [];
    for (var i = 0; i < matches.length; i++) {
        var include = true;
        //verify the match passes each filter test
        for (var key in filters) {
            if (conditions[key]) {
                //failed a test
                include = include && conditions[key](matches[i], filters[key]);
            }
        }
        //if we passed, push it
        if (include) {
            filtered.push(matches[i]);
        }
    }
    return filtered;
}

function sort(matches, sorts) {
    //console.log(sorts);
    //dir 1 ascending, -1 descending
    var sortFuncs = {
        match_id: function(a, b, dir) {
            return (a.match_id - b.match_id) * dir;
        },
        duration: function(a, b, dir) {
            return (a.duration - b.duration) * dir;
        },
        game_mode: function(a, b, dir) {
            return (a.game_mode - b.game_mode) * dir;
        },
        "players[0].kills": function(a, b, dir) {
            return (a.players[0].kills - b.players[0].kills) * dir;
        },
        "players[0].deaths": function(a, b, dir) {
            return (a.players[0].deaths - b.players[0].deaths) * dir;
        },
        "players[0].assists": function(a, b, dir) {
            return (a.players[0].assists - b.players[0].assists) * dir;
        },
        "players[0].level": function(a, b, dir) {
            return (a.players[0].level - b.players[0].level) * dir;
        },
        "players[0].last_hits": function(a, b, dir) {
            return (a.players[0].last_hits - b.players[0].last_hits) * dir;
        },
        "players[0].denies": function(a, b, dir) {
            return (a.players[0].denies - b.players[0].denies) * dir;
        },
        "players[0].gold_per_min": function(a, b, dir) {
            return (a.players[0].gold_per_min - b.players[0].gold_per_min) * dir;
        },
        "players[0].xp_per_min": function(a, b, dir) {
            return (a.players[0].xp_per_min - b.players[0].xp_per_min) * dir;
        },
        "players[0].hero_damage": function(a, b, dir) {
            return (a.players[0].hero_damage - b.players[0].hero_damage) * dir;
        },
        "players[0].tower_damage": function(a, b, dir) {
            return (a.players[0].tower_damage - b.players[0].tower_damage) * dir;
        },
        "players[0].hero_healing": function(a, b, dir) {
                return (a.players[0].hero_healing - b.players[0].hero_healing) * dir;
            }
            //TODO implement more sorts
            //game mode
            //hero (sort alpha?)
            //played time
            //result
            //region
            //parse status
    };
    for (var key in sorts) {
        if (key in sortFuncs) {
            matches.sort(function(a, b) {
                return sortFuncs[key](a, b, sorts[key]);
            });
        }
    }
    return matches;
}
/*
function getFullPlayerData(matches, doAction, cb) {
    cb();

    if (!doAction) {
        return cb();
    }
    //create array of ids to use for $in
    var match_ids = matches.map(function(m) {
        return m.match_id;
    });
    db.matches.find({
        match_id: {
            $in: match_ids
        }
    }, {
        fields: {
            "players.account_id": 1,
            "players.hero_id": 1,
            "players.player_slot": 1,
            match_id: 1
        }
    }, function(err, docs) {
        if (err) {
            return cb(err);
        }
        //build hash of match_id to full player data
        var hash = {};
        for (var i = 0; i < docs.length; i++) {
            hash[docs[i].match_id] = docs[i].players;
        }
        //iterate through given matches and populate all_players field
        for (var j = 0; j < matches.length; j++) {
            matches[j].all_players = hash[matches[j].match_id];
        }
        cb(err);
    });

}
    */
function getParsedPlayerData(matches, doAction, cb) {
    if (!doAction) {
        return cb();
    }
    //we optimize by filtering matches for only those with parse_status===2
    var parsed = matches.filter(function(m) {
        return m.parse_status === 2;
    });
    //the following does a query for each parsed match in the set, so could be a lot of queries
    //since we want a different position on each query, we need to make them individually
    async.each(parsed, function(m, cb) {
        var player = m.players[0];
        var parseSlot = player.player_slot % (128 - 5);
        db.matches.findOne({
            match_id: m.match_id
        }, {
            fields: {
                "parsed_data": 1,
                "parsed_data.version": 1,
                "parsed_data.chat": 1,
                "parsed_data.players": {
                    $slice: [parseSlot, 1]
                },
                match_id: 1
            }
        }, function(err, doc) {
            if (err) {
                return cb(err);
            }
            m.parsed_data = doc.parsed_data;
            cb(err);
        });
    }, function(err) {
        cb(err);
    });
    /*
    //diff approach that requires steam_id for each player, which is not present in v5 data, added to v7
    //parsed_data.players needs an identifier we can project on, such as steam_id
    //also need index on parsed_data.players.steam_id
    //compute the steam64 for this player
    //create array of ids to use for $in
    //NOTE this only works if we're getting parse data for a single steam_id
            var hash = {};

    //first player in first match's players has the account id we want
    var steam64 = matches[0] && matches[0].players[0] ? utility.convert32to64(matches[0].players[0].account_id).toString() : "";
    console.log(steam64);
    var match_ids = parsed.map(function(m) {
        return m.match_id;
    });
    db.matches.find({
        match_id: {
            $in: match_ids
        },
        "parsed_data.players.steam_id": steam64
    }, {
        fields: {
            "parsed_data": 1,
            "parsed_data.version": 1,
            "parsed_data.chat": 1,
            "parsed_data.players.$": 1,
            match_id: 1
        }
    }, function(err, docs) {
        if (err) {
            return cb(err);
        }
        //build hash of match_id to parsed_data
        for (var i = 0; i < docs.length; i++) {
            hash[docs[i].match_id] = docs[i].parsed_data;
        }
        //iterate through given matches and populate parsed_data field
        for (var j = 0; j < matches.length; j++) {
            matches[j].parsed_data = hash[matches[j].match_id];
        }
        cb(err);
    });
    */
}
module.exports = advQuery;