var db = require('./db');
var compute = require('./compute');
var computeMatchData = compute.computeMatchData;
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var isSignificant = utility.isSignificant;
var async = require('async');
var aggregator = require('./aggregator');
var constants = require('./constants.json');

function advQuery(query, cb) {
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
        players: 1,
        skill: 1
    };
    query.project = query.project || default_project;
    //only project the fields we need
    query.project["players.account_id"] = 1;
    query.project["players.hero_id"] = 1;
    query.project["players.level"] = 1;
    query.project["players.kills"] = 1;
    query.project["players.deaths"] = 1;
    query.project["players.assists"] = 1;
    query.project["players.gold_per_min"] = 1;
    query.project["players.xp_per_min"] = 1;
    query.project["players.hero_damage"] = 1;
    query.project["players.tower_damage"] = 1;
    query.project["players.hero_healing"] = 1;
    query.project["players.player_slot"] = 1;
    query.project["players.last_hits"] = 1;
    query.project["players.denies"] = 1;
    query.project["players.leaver_status"] = 1;
    //select,the query received, build the mongo query and the filter based on this
    query.mongo_select = {};
    query.js_select = {};
    //default limit
    var max = 500;
    //map to limit
    var mongoAble = {
        "players.account_id": 20000,
        "leagueid": max
    };
    var multiples = {
        "with_account_id": 1,
        "teammate_hero_id": 1,
        "against_hero_id": 1,
        "compare": 1
    };
    var queries = {
        "gtzero": {
            $gt: 0
        }
    };
    for (var key in query.select) {
        if (query.select[key] === "") {
            delete query.select[key];
        }
        else {
            if (key in multiples) {
                query.select[key] = [].concat(query.select[key]).map(function(e) {
                    return Number(e);
                });
            }
            else if (key in queries) {
                query.select[key] = queries[query.select[key]];
            }
            else if (typeof query.select[key] === "string") {
                query.select[key] = Number(query.select[key]);
            }
            if (mongoAble[key]) {
                query.mongo_select[key] = query.select[key];
                max = Math.max(mongoAble[key], max);
            }
            else {
                query.js_select[key] = query.select[key];
            }
        }
    }
    //js_agg, aggregations to do with js
    //do all aggregations if null, so we need parsed data
    var bGetParsedPlayerData = Boolean(!query.js_agg);
    //limit, pass to mongodb, cap the number of matches to return in mongo
    query.limit = (!query.limit || query.limit > max) ? max : query.limit;
    //skip, pass to mongodb
    //sort, pass to mongodb
    //js_limit, the number of results to return in a page, filtered by js
    //js_start, the position to start a page at, selected by js
    //js_sort, post-process sorter that processes with js
    //build the monk hash
    var monk_options = {
        limit: query.limit,
        skip: query.skip,
        sort: query.sort,
        fields: query.project
    };
    //console.log(query);
    console.time('querying database');
    // console.log(options);
    db.matches.find(query.mongo_select, monk_options, function(err, matches) {
        if (err) {
            return cb(err);
        }
        console.timeEnd('querying database');
        console.time('expanding matches');
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
                    for (var key in query.mongo_select) {
                        var split = key.split(".");
                        if (split[0] === "players" && p[split[1]] !== query.mongo_select[key]) {
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
        console.timeEnd('expanding matches');
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
            var filtered = filter(matches, query.js_select);
            //filtered = sort(filtered, options.js_sort);
            // console.log('aggData: options.js_agg = %s', options.js_agg);
            var aggData = aggregator(filtered, query.js_agg);
            var result = {
                aggData: aggData,
                page: filtered.slice(query.js_skip, query.js_skip + query.js_limit),
                data: filtered,
                unfiltered_count: matches.length
            };
            console.timeEnd('computing aggregations');
            cb(err, result);
        });
    });
}

function filter(matches, filters) {
    //accept a hash of filters, run all the filters in the hash in series
    //console.log(filters);
    var conditions = {
        //filter: significant, remove unbalanced game modes/lobbies
        significant: function(m, key) {
            return Number(isSignificant(constants, m)) === key;
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
            return key.every(function(k) {
                return m.all_players.some(function(p) {
                    return p.account_id === k;
                });
            });
        },
        //teammate_hero_id
        teammate_hero_id: function(m, key) {
            return key.every(function(k) {
                return m.all_players.some(function(p) {
                    return (p.hero_id === k && isRadiant(p) === isRadiant(m.players[0]));
                });
            });
        },
        //against_hero_id
        against_hero_id: function(m, key) {
                return key.every(function(k) {
                    return m.all_players.some(function(p) {
                        return (p.hero_id === k && isRadiant(p) !== isRadiant(m.players[0]));
                    });
                });
            }
            //TODO implement more filters
            //filter: specific regions
            //filter: endgame item
            //filter: max gold/xp advantage
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
/*
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
    //since we might want a different position on each query, we need to make them individually
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
}
module.exports = advQuery;