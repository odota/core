var db = require('./db');
var compute = require('./compute');
var computeMatchData = compute.computeMatchData;
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var mergeObjects = utility.mergeObjects;
var constants = require('./constants.json');

function aggregator(matches, fields) {
    var types = {
        "start_time": function(key, m, p) {
            agg(key, m.start_time, m);
        },
        "duration": function(key, m, p) {
            agg(key, m.duration, m);
        },
        "cluster": function(key, m, p) {
            agg(key, m.cluster, m);
        },
        "first_blood_time": function(key, m, p) {
            agg(key, m.first_blood_time, m);
        },
        "lobby_type": function(key, m, p) {
            agg(key, m.lobby_type, m);
        },
        "game_mode": function(key, m, p) {
            agg(key, m.game_mode, m);
        },
        "hero_id": function(key, m, p) {
            agg(key, p.hero_id, m);
        },
        "kills": function(key, m, p) {
            agg(key, p.kills, m);
        },
        "deaths": function(key, m, p) {
            agg(key, p.deaths, m);
        },
        "assists": function(key, m, p) {
            agg(key, p.assists, m);
        },
        "last_hits": function(key, m, p) {
            agg(key, p.last_hits, m);
        },
        "denies": function(key, m, p) {
            agg(key, p.denies, m);
        },
        "gold_per_min": function(key, m, p) {
            agg(key, p.gold_per_min, m);
        },
        "xp_per_min": function(key, m, p) {
            agg(key, p.xp_per_min, m);
        },
        "hero_damage": function(key, m, p) {
            agg(key, p.hero_damage, m);
        },
        "tower_damage": function(key, m, p) {
            agg(key, p.tower_damage, m);
        },
        "hero_healing": function(key, m, p) {
            agg(key, p.hero_healing, m);
        },
        "leaver_status": function(key, m, p) {
            agg(key, p.leaver_status, m);
        },
        "isRadiant": function(key, m, p) {
            agg(key, isRadiant(p), m);
        },
        "stuns": function(key, m, p) {
            agg(key, p.parsedPlayer.stuns, m);
        },
        "lane": function(key, m, p) {
            agg(key, p.parsedPlayer.lane, m);
        },
        "lane_role": function(key, m, p) {
            agg(key, p.parsedPlayer.lane_role, m);
        },
        //lifetime ward positions
        "obs": function(key, m, p) {
            agg(key, p.parsedPlayer.obs, m);
        },
        "sen": function(key, m, p) {
            agg(key, p.parsedPlayer.sen, m);
        },
        //lifetime rune counts
        "runes": function(key, m, p) {
            agg(key, p.parsedPlayer.runes, m);
        },
        //lifetime item uses
        "item_uses": function(key, m, p) {
            agg(key, p.parsedPlayer.item_uses, m);
        },
        //track sum of purchase times and counts to get average build time
        "purchase_time": function(key, m, p) {
            agg(key, p.parsedPlayer.purchase_time, m);
        },
        "purchase_time_count": function(key, m, p) {
            agg(key, p.parsedPlayer.purchase_time_count, m);
        },
        "purchase": function(key, m, p) {
            agg(key, p.parsedPlayer.purchase, m);
        },
        "kills_count": function(key, m, p) {
            agg(key, p.parsedPlayer.kills, m);
        },
        "gold_reasons": function(key, m, p) {
            agg(key, p.parsedPlayer.gold_reasons, m);
        },
        "xp_reasons": function(key, m, p) {
            agg(key, p.parsedPlayer.xp_reasons, m);
        },
        "ability_uses": function(key, m, p) {
            agg(key, p.parsedPlayer.ability_uses, m);
        },
        "hero_hits": function(key, m, p) {
            agg(key, p.parsedPlayer.hero_hits, m);
        },
        "courier_kills": function(key, m, p) {
            agg(key, p.parsedPlayer.courier_kills, m);
        },
        "tower_kills": function(key, m, p) {
            agg(key, p.parsedPlayer.tower_kills, m);
        },
        "neutral_kills": function(key, m, p) {
            agg(key, p.parsedPlayer.neutral_kills, m);
        },
        "chat_message_count": function(key, m, p) {
            agg(key, p.parsedPlayer.chat_message_count, m);
        },
        "gg_count": function(key, m, p) {
            agg(key, p.parsedPlayer.gg_count, m);
        },
        "buyback_count": function(key, m, p) {
            agg(key, p.parsedPlayer.buyback_count, m);
        },
        "observer_uses": function(key, m, p) {
            agg(key, p.parsedPlayer.observer_uses, m);
        },
        "sentry_uses": function(key, m, p) {
            agg(key, p.parsedPlayer.sentry_uses, m);
        }
    };
    var aggData = {};
    fields = fields || types;
    for (var type in fields) {
        aggData[type] = {
            sum: 0,
            min: Number.MAX_VALUE,
            max: 0,
            max_match: null,
            n: 0,
            counts: {},
        };
    }
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        var p = m.players[0];
        for (var type in fields) {
            if (types[type]) {
                types[type](type, m, p);
            }
        }
    }
    return aggData;

    function agg(key, value, match) {
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
    console.log(filters);
    //accept a hash of filters, run all the filters in the hash in series
    var filtered = [];
    for (var key in filters) {
        for (var i = 0; i < matches.length; i++) {
            if (key === "balanced") {
                if (constants.modes[matches[i].game_mode].balanced && constants.lobbies[matches[i].lobby_type].balanced) {
                    filtered.push(matches[i]);
                }
            }
            else if (key === "win") {
                if (isRadiant(matches[i].players[0]) === matches[i].radiant_win) {
                    filtered.push(matches[i]);
                }
            }
            else if (key === "hero_id") {
                if (matches[i].players[0].hero_id === Number(filters["hero_id"])) {
                    filtered.push(matches[i]);
                }
            }
            else {
                filtered.push(matches[i]);
            }
        }
        matches = filtered.slice(0);
        filtered = [];
    }
    return matches;
}

function advQuery(options, cb) {
    //options passed:
    //select,the query to send to mongodb
    //project, the projection to send to mongodb, null to use default
    //filter,additional post-processing filters
    //agg, aggregations to do
    //limit
    //skip
    //sort
    //length, the number of results to return in a page
    //start, the position to start a page at
    //usage
    //matches page, want matches fitting criteria
    //player matches page, want winrate, matches fitting criteria, also need to display player information
    //player trends page, want aggregation on matches fitting criteria
    //todo implement more features
    //filter: specific player/specific hero id
    //filter: specific player was also in the game (use players.account_id with $and, but which player gets returned by projection?  or could just do in js)
    //filter: specific hero was played by me, on my team, was against me, was in the game
    //filter: specific game modes
    //filter: specific patches
    //filter: specific regions
    //filter: no stats recorded (need to implement filter to detect)
    //filter: significant game modes only (balanced filter)
    //filter: win
    //filter kill differential, gold/xp differential?
    options.project = options.project || {
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
    console.log(options.select);
    if (options.select["players.account_id"] || options.select["players.hero_id"]) {
        //if selecting by account_id or hero_id, we project only that user in players array
        options.project["players.$"] = 1;
    }
    else {
        //otherwise, always project a player to prevent computematchdata crash
        options.project.players = {
            $slice: 1
        };
        options.project["players.account_id"] = 1;
    }
    //cap the number of matches to analyze
    var max = 20000;
    options.limit = (!options.limit || options.limit > max) ? max : options.limit;
    //build the monk hash
    var monk = {
        limit: options.limit,
        skip: options.skip,
        sort: options.sort,
        fields: options.project
    };
    console.time('db');
    db.matches.find(options.select, monk, function(err, matches) {
        if (err) {
            console.log(err);
            return cb(err);
        }
        console.timeEnd('db');
        //console.time('compute');
        for (var i = 0; i < matches.length; i++) {
            computeMatchData(matches[i]);
        }
        //console.timeEnd('compute');
        //console.time('filter');
        var filtered = filter(matches, options.filter);
        //console.timeEnd('filter');
        //console.time('agg');
        var aggData = aggregator(filtered, options.agg);
        //console.timeEnd('agg');
        //console.time('post');
        aggData.win = 0;
        aggData.lose = 0;
        aggData.games = 0;
        for (var i = 0; i < filtered.length; i++) {
            var m = filtered[i];
            aggData.games += 1;
            m.player_win ? aggData.win += 1 : aggData.lose += 1;
        }
        filtered.sort(function(a, b) {
            return b.match_id - a.match_id;
        });
        //console.timeEnd('post');
        var result = {
            aggData: aggData,
            page: filtered.slice(options.start,options.start+options.length),
            data: filtered,
            unfiltered: matches
        };
        cb(err, result);
    });
}
module.exports = advQuery;