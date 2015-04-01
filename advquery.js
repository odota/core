var db = require('./db');
var compute = require('./compute');
var computeMatchData = compute.computeMatchData;
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var mergeObjects = utility.mergeObjects;
var constants = require('./constants.json');

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
                    if (isRadiant(tm) === m.player_radiant) {
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
                if (isRadiant(tm) === m.player_radiant) {
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
        "chat_message_count": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.chat_message_count, m);
        },
        "gg_count": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.gg_count, m);
        },
        "buyback_count": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.buyback_count, m);
        },
        "observer_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.observer_uses, m);
        },
        "sentry_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.sentry_uses, m);
        }
    };
    fields = fields || types;
    //ensure aggData isn't null for each requested aggregation field
    for (var key in fields) {
        aggData[key] = {
            sum: 0,
            min: Number.MAX_VALUE,
            max: 0,
            max_match: null,
            n: 0,
            counts: {}
        };
    }
    //"special fields", win, lose, games, teammates, matchups
    //overwrite standard agg object
    //count win/lose/games
    aggData.win = 0;
    aggData.lose = 0;
    aggData.games = 0;
    aggData.teammates = {};
    aggData.matchups = {};
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
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        var p = m.players[0];
        for (var agg in fields) {
            if (types[agg]) {
                //execute the aggregation function on this match for each passed aggregation field
                types[agg](agg, m, p);
            }
        }
    }
    return aggData;

    function standardAgg(key, value, match) {
        var m = aggData[key];
        if (typeof value === "undefined") {
            return;
        }
        m.n += 1;
        if (typeof value === "object") {
            mergeObjects(m.counts, value);
        }
        else {
            if (!m.counts[value]) {
                m.counts[value] = 0;
            }
            m.counts[value] += 1;
            m.sum += (value || 0);
            if (value < m.min) {
                m.min = value;
            }
            if (value > m.max) {
                m.max = value;
                m.max_match = match;
            }
        }
    }
}

function filter(matches, filters) {
    //accept a hash of filters, run all the filters in the hash in series
    console.log(filters);
    //todo implement more filters
    //filter: specific regions (tricky because there are multiple ids per region)
    //filter: endgame item
    //filter: no stats recorded (need to implement custom filter to detect)
    //filter kill differential
    //filter max gold/xp advantage
    //more filters from parse data
    var conditions = {
        //filter: balanced game modes only
        balanced: function(m, key) {
            return Number(constants.modes[m.game_mode].balanced && constants.lobbies[m.lobby_type].balanced) === key;
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
        //GETFULLPLAYERDATA: we need to request getFullPlayerData for these, and then iterate over match.all_players
        //todo for these filters, if not an array, create array of one element
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
                    return (p.hero_id === k && isRadiant(p) === m.player_radiant);
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
                    return (p.hero_id === k && isRadiant(p) !== m.player_radiant);
                });
            });
        }
    };
    var filtered = [];
    for (var i = 0; i < matches.length; i++) {
        var include = true;
        //verify the match passes each filter test
        for (var key in filters) {
            if (!conditions[key](matches[i], filters[key])) {
                //failed a test
                include = false;
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
    //todo implement more sorts
    //dir 1 ascending, -1 descending
    var sortFuncs = {
        match_id: function(a, b, dir) {
            return (a.match_id - b.match_id) * dir;
        },
        duration: function(a, b, dir) {
            return (a.duration - b.duration) * dir;
        }
    };
    for (var key in sorts) {
        matches.sort(function(a, b) {
            return sortFuncs[key](a, b, sorts[key]);
        });
    }
    return matches;
}

function advQuery(options, cb) {
    var default_project = {
        //todo only request parsed data if necessary (trends)
        parsed_data: 1,
        start_time: 1,
        match_id: 1,
        cluster: 1,
        game_mode: 1,
        duration: 1,
        radiant_win: 1,
        parse_status: 1,
        first_blood_time: 1,
        lobby_type: 1
    };
    //project, the projection to send to mongodb, add default fields to those supplied
    for (var key in default_project) {
        options.project[key] = default_project[key];
    }
    //select,the query received, build the mongo query and the filter based on this
    options.mongo_select = {};
    options.js_select = {};
    var mongoAble = {
        "players.account_id": 1,
        "players.hero_id": 1
    };
    for (var key in options.select) {
        //select key could come in as array, number, or string
        //if array, number each element and pass it on
        //if Number, number it and pass it on
        if (options.select[key] === "" || !Number(options.select[key])) {
            //if NaN or empty string, ignore it
            continue;
        }
        else {
            if (options.select[key].constructor === Array) {
                options.select[key] = options.select[key].map(function(e) {
                    return Number(e);
                });
            }
            else {
                options.select[key] = Number(options.select[key]);
            }
            if (mongoAble[key]) {
                //only project the matching player
                options.project["players.$"] = 1;
                options.mongo_select[key] = options.select[key];
            }
            else {
                options.js_select[key] = options.select[key];
            }
        }
    }
    if (!options.project["players.$"]) {
        //NOTE: for some reason, trying to project all players with no select condition is slow, so we make it invariant that a single player is projected
        //always project a player to prevent computematchdata/aggregation crash
        options.project.players = {
            $slice: 1
        };
    }
    //js_agg, aggregations to do with js
    //do everything if null passed as fields
    //some aggregations/filters require hero_id and player_id of all 10 players in a game
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
    //limit, pass to mongodb
    //cap the number of matches to return in mongo
    var max = 15000;
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
    //20000 matches@100kb each is 2gb, js will have trouble handling large numbers of matches with parsed data in memory
    //stream the query results, exclude extra data from the matches array we build
    var matches = [];
    console.time('db');
    db.matches.find(options.mongo_select, monk_options).each(function(m) {
        computeMatchData(m);
        //reduce memory use by removing parsed_data and players.ability_upgrades
        delete m.parsed_data;
        delete m.players[0].ability_upgrades;
        //copy to matches array
        matches.push(m);
    }).error(function(err) {
        console.log(err);
        return cb(err);
    }).success(function() {
        console.timeEnd('db');
        //add a player_radiant property to each match for efficient teammate lookup
        for (var i = 0; i < matches.length; i++) {
            var m = matches[i];
            var p = m.players[0];
            m.player_radiant = isRadiant(p);
        }
        getFullPlayerData(matches, bGetFullPlayerData, function(err) {
            if (err) {
                return cb(err);
            }
            console.time('compute');
            //sort first so the display matches are in the right order
            matches = sort(matches, options.js_sort);
            //report unfiltered count
            var unfiltered_count = matches.length;
            //make array of unfiltered "recent matches" for display
            var display_matches = matches.slice(0, 15);
            var filtered = filter(matches, options.js_select);
            var aggData = aggregator(filtered, options.js_agg);
            var result = {
                aggData: aggData,
                page: filtered.slice(options.js_skip, options.js_skip + options.js_limit),
                data: filtered,
                unfiltered_count: unfiltered_count,
                display_matches: display_matches
            };
            console.timeEnd('compute');
            cb(err, result);
        });
    });
}

function getFullPlayerData(matches, doAction, cb) {
    if (!doAction) {
        return cb();
    }
    //create array of ids to use for $in
    var match_ids = matches.map(function(m) {
        return m.match_id;
    });
    console.time("fullplayerdata");
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
        console.timeEnd("fullplayerdata");
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
module.exports = advQuery;