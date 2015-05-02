var db = require('./db');
var compute = require('./compute');
var computeMatchData = compute.computeMatchData;
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var mergeObjects = utility.mergeObjects;
var constants = require('./constants.json');
var queries = require('./queries');
var async = require('async');

function advQuery(options, cb) {
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
        dire_name: 1
    };
    options.project = options.project || default_project;
    options.project.players = 1;
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
    var max = 500;
    //map to limit
    var mongoAble = {
        "players.account_id": 10000,
        "leagueid": 500
            //"players.hero_id": 10000
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
                if (options.select[key].indexOf(",") !== -1) {
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
    //do everything if null passed as fields
    var bGetFullPlayerData = false;
    /*
    //some aggregations/selections require hero_id and player_id of all 10 players in a game
    var fullPlayerData = {
        "teammates": 1,
        "matchups": 1,
        "with_account_id": 1,
        "teammate_hero_id": 1,
        "against_hero_id": 1,
        "with_hero_id": 1
    };
    //if js_agg is null, we need the full data since we're aggregating everything
    var bGetFullPlayerData = Boolean(!options.js_agg);
    for (var key in options.js_agg) {
        bGetFullPlayerData = bGetFullPlayerData || (key in fullPlayerData);
    }
    for (var key in options.js_select) {
        bGetFullPlayerData = bGetFullPlayerData || (key in fullPlayerData);
    }
    */
    //determine if we're doing an aggregation/selection that requires parsed data
    //var parsedPlayerData = {};
    //this just gets the parsed data if js_agg is null (do everything)
    var bGetParsedPlayerData = Boolean(!options.js_agg);
    console.log(bGetParsedPlayerData);
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
    console.log(options);
    console.time('db');
    db.matches.find(options.mongo_select, monk_options, function(err, matches) {
        if (err) {
            return cb(err);
        }
        console.timeEnd('db');
        var expanded_matches = [];
        matches.forEach(function(m) {
            //get all_players and primary player
            m.all_players = m.players.slice(0);
            //console.log(m.players.length, m.all_players.length);
            //use the mongodb select criteria to filter the player list
            //create a new match with this primary player
            //all players for tournament games, otherwise player matching select criteria
            m.players.forEach(function(p) {
                var pass = true;
                //check mongo query, if starting with player
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
        });
        matches = expanded_matches;
        console.time("fullplayerdata");
        getFullPlayerData(matches, bGetFullPlayerData, function(err) {
            if (err) {
                return cb(err);
            }
            console.timeEnd("fullplayerdata");
            console.time("parsedplayerdata");
            getParsedPlayerData(matches, bGetParsedPlayerData, function(err) {
                if (err) {
                    return cb(err);
                }
                console.timeEnd("parsedplayerdata");
                console.time('compute');
                matches.forEach(function(m) {
                    //post-process the match to get additional stats
                    computeMatchData(m);
                });
                var filtered = filter(matches, options.js_select);
                filtered = sort(filtered, options.js_sort);
                var aggData = aggregator(filtered, options.js_agg);
                console.time('teammate_lookup');
                queries.fillPlayerNames(aggData.teammates, function(err) {
                    console.timeEnd('teammate_lookup');
                    var result = {
                        aggData: aggData,
                        page: filtered.slice(options.js_skip, options.js_skip + options.js_limit),
                        data: filtered,
                        unfiltered_count: matches.length
                    };
                    console.timeEnd('compute');
                    cb(err, result);
                });
            });
        });
    });
}

function aggregator(matches, fields) {
    var aggData = {};
    var types = {
        "matchups": function(key, m, p) {
            var matchups = aggData.matchups;
            var player_win = m.player_win;
            for (var j = 0; j < m.all_players.length; j++) {
                var tm = m.all_players[j];
                var tm_hero = tm.hero_id;
                if (tm_hero in matchups) {
                    //don't count invalid heroes
                    if (isRadiant(tm) === isRadiant(p)) {
                        //count teammate heroes
                        if (tm.account_id === p.account_id) {
                            //console.log("self %s", tm_hero);
                            matchups[tm_hero].games += 1;
                            matchups[tm_hero].win += player_win ? 1 : 0;
                            if (m.start_time > matchups[tm_hero].last_played) {
                                matchups[tm_hero].last_played = m.start_time;
                            }
                        }
                        else {
                            //console.log("teammate %s", tm_hero);
                            matchups[tm_hero].with_games += 1;
                            matchups[tm_hero].with_win += player_win ? 1 : 0;
                        }
                    }
                    else {
                        //count enemy heroes
                        //console.log("opp %s", tm_hero);
                        matchups[tm_hero].against_games += 1;
                        matchups[tm_hero].against_win += player_win ? 1 : 0;
                    }
                }
            }
        },
        "teammates": function(key, m, p) {
            var teammates = aggData.teammates;
            for (var j = 0; j < m.all_players.length; j++) {
                var tm = m.all_players[j];
                if (isRadiant(tm) === isRadiant(p)) {
                    //count teammate players
                    if (!teammates[tm.account_id]) {
                        teammates[tm.account_id] = {
                            account_id: tm.account_id,
                            last_played: 0,
                            win: 0,
                            games: 0
                        };
                    }
                    if (m.start_time > teammates[tm.account_id].last_played) {
                        teammates[tm.account_id].last_played = m.start_time;
                    }
                    teammates[tm.account_id].games += 1;
                    teammates[tm.account_id].win += m.player_win ? 1 : 0;
                }
            }
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
        "gold_per_min": function(key, m, p) {
            standardAgg(key, p.gold_per_min, m);
        },
        "xp_per_min": function(key, m, p) {
            standardAgg(key, p.xp_per_min, m);
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
        "leaver_status": function(key, m, p) {
            standardAgg(key, p.leaver_status, m);
        },
        "isRadiant": function(key, m, p) {
            standardAgg(key, isRadiant(p), m);
        },
        //following aggregations require parsed data
        "stuns": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.stuns, m);
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
        "observer_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.observer_uses, m);
        },
        "sentry_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.sentry_uses, m);
        },
        "multi_kills": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.multi_kills, m);
        },
        "kill_streaks": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.kill_streaks, m);
        },
    };
    //if null fields passed in, do all aggregations
    fields = fields || types;
    //ensure aggData isn't null for each requested aggregation field
    for (var key in fields) {
        if (key === "win" || key === "lose" || key === "games") {
            aggData[key] = 0;
        }
        else if (key === "teammates" || key === "matchups") {
            aggData[key] = {};
            if (key === "matchups") {
                //prefill matchups with every hero
                for (var hero_id in constants.heroes) {
                    var obj = {
                        hero_id: hero_id,
                        last_played: 0,
                        games: 0,
                        win: 0,
                        with_games: 0,
                        with_win: 0,
                        against_games: 0,
                        against_win: 0
                    };
                    aggData.matchups[hero_id] = obj;
                }
            }
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
    //get teammates, heroes, convert hashes to arrays and sort them
    if (aggData.matchups) {
        var heroes_arr = [];
        var matchups = aggData.matchups;
        for (var id in matchups) {
            var h = matchups[id];
            heroes_arr.push(h);
        }
        heroes_arr.sort(function(a, b) {
            return b.games - a.games;
        });
        aggData.matchups = heroes_arr;
    }
    if (aggData.teammates) {
        var teammates_arr = [];
        var teammates = aggData.teammates;
        for (var id in teammates) {
            var tm = teammates[id];
            id = Number(id);
            //don't include if anonymous or if less than 3 games
            if (id !== constants.anonymous_account_id && tm.games >= 3) {
                teammates_arr.push(tm);
            }
        }
        teammates_arr.sort(function(a, b) {
            return b.games - a.games;
        });
        aggData.teammates = teammates_arr;
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
        //TODO detect no stats recorded?
        significant: function(m, key) {
            return Number(constants.game_mode[m.game_mode].balanced && constants.lobby_type[m.lobby_type].balanced) === key;
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
        hero_id: function(m, key) {
            return m.players[0].hero_id === key;
        },
        isRadiant: function(m, key) {
            return Number(m.players[0].isRadiant) === key;
        },
        //GETFULLPLAYERDATA: we need to request getFullPlayerData for these, and then iterate over match.all_players
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
                    return (p.hero_id === k && isRadiant(p) === isRadiant(m.players[0]) && p.account_id !== m.players[0].account_id);
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
            //filter: specific regions (tricky because there are multiple ids per region)
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

function getFullPlayerData(matches, doAction, cb) {
    cb();
    /*
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
    */
}

function getParsedPlayerData(matches, doAction, cb) {
    if (!doAction) {
        return cb();
    }
    var parsed = matches.filter(function(m) {
        return m.parse_status === 2;
    });
    var hash = {};
    //we optimize by filtering matches for only those with parse_status===2
    //first player in first match's players has the account id we want
    var steam64 = matches[0] && matches[0].players[0] ? utility.convert32to64(matches[0].players[0].account_id).toString() : "";
    //the following does a query for each match in the set, so could be a lot of queries
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
    //diff approach, but requires steam_id for each player, which is not present in v5 data, added to v7
    //parsed_data.players needs an identifier we can project on, such as steam_id
    //also need index on parsed_data.players.steam_id
    //compute the steam64 for this player
    //create array of ids to use for $in
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