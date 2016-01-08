var express = require('express');
var players = express.Router();
var async = require('async');
var constants = require('../constants.js');
var queries = require("../queries");
var getPlayerMatches = queries.getPlayerMatches;
var getPlayer = queries.getPlayer;
var utility = require('../utility');
var generatePositionData = utility.generatePositionData;
var isRadiant = utility.isRadiant;
var config = require('../config');
var preprocessQuery = utility.preprocessQuery;
var filter = require('../filter');
var querystring = require('querystring');
var moment = require('moment');
var util = require('util');
var playerCache = require('../playerCache');
var readCache = playerCache.readCache;
var writeCache = playerCache.writeCache;
var subkeys = {
    "kills": 1,
    "deaths": 1,
    "assists": 1,
    "kda": 1,
    "gold_per_min": 1,
    "xp_per_min": 1,
    "last_hits": 1,
    "denies": 1,
    "lane_efficiency_pct": 1,
    "duration": 1,
    "first_blood_time": 1,
    "level": 1,
    "hero_damage": 1,
    "tower_damage": 1,
    "hero_healing": 1,
    "stuns": 1,
    "tower_kills": 1,
    "neutral_kills": 1,
    "courier_kills": 1,
    "purchase_tpscroll": 1,
    "purchase_ward_observer": 1,
    "purchase_ward_sentry": 1,
    "purchase_gem": 1,
    "purchase_rapier": 1,
    "pings": 1,
    "throw": 1,
    "comeback": 1,
    "stomp": 1,
    "loss": 1,
    "actions_per_min": 1
};
//optimize by only projecting certain columns based on tab  set query.project based on info
var basic = ['player_matches.match_id', 'hero_id', 'start_time', 'duration', 'kills', 'deaths', 'assists', 'player_slot', 'account_id', 'game_mode', 'lobby_type', 'match_skill.skill', 'parse_status', 'radiant_win', 'leaver_status', 'version', 'cluster'];
var advanced = ['last_hits', 'denies', 'gold_per_min', 'xp_per_min', 'gold_t', 'first_blood_time', 'level', 'hero_damage', 'tower_damage', 'hero_healing', 'stuns', 'killed', 'pings', 'radiant_gold_adv', 'actions'];
var others = ['pgroup', 'kill_streaks', 'multi_kills', 'obs', 'sen', 'purchase_log', 'item_uses', 'hero_hits', 'ability_uses', 'chat'];
var filter = ['purchase', 'lane_pos'];
var everything = basic.concat(advanced).concat(others).concat(filter);
var projections = {
    index: basic,
    matches: basic,
    heroes: basic.concat('pgroup'),
    peers: basic.concat('pgroup'),
    activity: basic,
    histograms: basic.concat(advanced).concat(['purchase']),
    records: basic.concat(advanced).concat(['purchase']),
    counts: basic.concat(advanced),
    trends: basic.concat(advanced).concat(['purchase']),
    sprees: basic.concat(['kill_streaks', 'multi_kills']),
    wardmap: basic.concat(['obs', 'sen']),
    items: basic.concat(['purchase', 'purchase_log', 'item_uses']),
    skills: basic.concat(['hero_hits', 'ability_uses']),
    wordcloud: basic.concat('chat'),
    rating: basic
};
var sigModes = [];
for (var key in constants.game_mode)
{
    if (constants.game_mode[key].balanced)
    {
        sigModes.push(Number(key));
    }
}
var sigLobbies = [];
for (var key in constants.lobby_type)
{
    if (constants.lobby_type[key].balanced)
    {
        sigLobbies.push(Number(key));
    }
}
var playerPages = constants.player_pages;
module.exports = function(db, redis)
{
    players.get('/sql/:account_id/:info?/:subkey?', function(req, res, next)
    {
        var significant = util.format("game_mode in (%s) and lobby_type in (%s) and radiant_win is not null and duration > 300", sigModes.join(","), sigLobbies.join(","));
        var info = playerPages[req.params.info] ? req.params.info : "index";
        var account_id = req.params.account_id;
        if (Number(account_id) === constants.anonymous_account_id)
        {
            return next("cannot generate profile for anonymous account_id");
        }
        //TODO
        //disable special filters: with/against/included, purchased_item, lane_role, patch, region, faction, win
        //make histograms/records/trends work
        //add significance check to all
        getPlayer(db, account_id, function(err, player)
        {
            if (err)
            {
                return next(err);
            }
            async.parallel(
            {
                matches: function(cb)
                {
                    db.select(basic).from('player_matches').join('matches', 'matches.match_id', 'player_matches.match_id').leftJoin('match_skill', 'player_matches.match_id', "match_skill.match_id").where(
                    {
                        account_id: account_id
                    }).orderBy('match_id', 'desc').limit(20).asCallback(function(err, matches)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        matches.forEach(function(m)
                        {
                            m.player_win = isRadiant(m) === m.radiant_win;
                        });
                        cb(err, matches);
                    });
                },
                heroes: function(cb)
                {
                    db('player_matches').select(db.raw("hero_id, max(start_time) as last_played, count(*) as games, sum(case when radiant_win = player_slot < 64 then 1 else 0 end) as win")).join(db.raw("matches on matches.match_id = player_matches.match_id")).whereRaw(significant).where(db.raw("account_id = ?", [account_id])).groupBy("hero_id").orderBy("games", "desc").where(req.query).asCallback(cb);
                },
                counts: function(cb)
                {
                    db('player_matches').select(db.raw("sum(case when radiant_win = player_slot < 64 then 1 else 0 end) as win, sum(case when radiant_win = player_slot < 64 then 0 else 1 end) as lose, sum(case when leaver_status > 1 then 1 else 0 end) as abandon_count, count(*) as match_count, sum(case when version > 0 then 1 else 0 end) as parsed_match_count")).join(db.raw("matches on player_matches.match_id = matches.match_id")).whereRaw(significant).where(db.raw("account_id = ?", [account_id])).where(req.query).asCallback(cb);
                },
                sets: function(cb)
                {
                    queries.getSets(redis, cb);
                },
                //players_with: function(cb)
                //{
                //    //db.raw("select js2.value as account_id, count(*) as games from player_matches join matches on matches.match_id = player_matches.match_id, json_each(pgroup) AS js, json_each_text(value) js2 where account_id = ? and js2.key = 'account_id' group by js2.value order by games desc", [account_id]).asCallback(cb);
                //    var inner2 = "select player_matches.match_id, start_time, (player_slot < 64 = radiant_win) as player_win, (player_slot < 64) as player_radiant from player_matches join matches on matches.match_id = player_matches.match_id where player_matches.account_id = ?";
                //    var inner = "select player_matches.account_id, max(start_time) as last_played, count(*) as with_games, sum(case when player_win then 1 else 0 end) as with_win from player_matches join (" + inner2 + ") pm on pm.match_id = player_matches.match_id where (player_slot < 64) = player_radiant group by player_matches.account_id order by with_games desc limit 100";
                //    db.raw("select * from (" + inner + ") res left join players on players.account_id = res.account_id", [account_id]).asCallback(cb);
                //},
                //players_against: function(cb)
                //{
                //    var inner2 = "SELECT player_matches.match_id, start_time, (player_slot < 64 = radiant_win) AS player_win, (player_slot < 64) AS player_radiant FROM   player_matches JOIN   matches ON     matches.match_id = player_matches.match_id WHERE  player_matches.account_id = ?";
                //    var inner = "SELECT player_matches.account_id, Max(start_time) AS last_played, Count(*) AS against_games,  Sum( CASE WHEN player_win THEN 1 ELSE 0  END) AS against_win from player_matches join (" + inner2 + ") pm on pm.match_id = player_matches.match_id where (player_slot < 64) != player_radiant group by player_matches.account_id order by against_games desc limit 100";
                //    db.raw("SELECT * FROM (" + inner + ") res left join players on players.account_id = res.account_id", [account_id]).asCallback(cb);
                //},
                //heroes_with: function(cb)
                //{
                //    db.raw("select hero_id, count(*) as with_games, max(start_time) as last_played, sum(case when player_win then 1 else 0 end) as with_win from player_matches join (select player_matches.match_id, start_time, (player_slot < 64 = radiant_win) as player_win, (player_slot < 64) as player_radiant from player_matches join matches on matches.match_id = player_matches.match_id where account_id = ?) pm on pm.match_id = player_matches.match_id where (player_slot < 64) = player_radiant group by hero_id order by with_games desc", [account_id]).asCallback(cb);
                //},
                //heroes_against: function(cb)
                //{
                //    db.raw("select hero_id, count(*) as against_games, max(start_time) as last_played, sum(case when player_win then 1 else 0 end) as against_win from player_matches join (select player_matches.match_id, start_time, (player_slot < 64 = radiant_win) as player_win, (player_slot < 64) as player_radiant from player_matches join matches on matches.match_id = player_matches.match_id where account_id = ?) pm on pm.match_id = player_matches.match_id where (player_slot < 64) != player_radiant group by hero_id order by against_games desc", [account_id]).asCallback(cb);
                //},
                ratings: function(cb)
                {
                    queries.getPlayerRatings(db, account_id, cb);
                }
            }, function(err, result)
            {
                if (err)
                {
                    return next(err);
                }
                player.aggData = {
                    matches: result.matches
                };
                player.win = result.counts[0].win;
                player.lose = result.counts[0].lose;
                player.abandon_count = result.counts[0].abandon_count;
                player.match_count = result.counts[0].match_count;
                player.parsed_match_count = result.counts[0].parsed_match_count;
                player.heroes_list = result.heroes;
                //player.heroes_with = result.heroes_with.rows;
                //player.heroes_against = result.heroes_against.rows;
                //player.players_with = result.players_with.rows;
                //player.players_against = result.players_against.rows;
                player.ratings = result.ratings;
                if (req.query.json)
                {
                    return res.json(player);
                }
                res.render("player/player_" + info,
                {
                    q: req.query,
                    querystring: Object.keys(req.query).length ? "?" + querystring.stringify(req.query) : "",
                    route: info,
                    tabs: playerPages,
                    player: player,
                    trackedPlayers: result.sets.trackedPlayers,
                    histograms: subkeys,
                    subkey: req.params.subkey || "kills",
                    times:
                    {
                        "duration": 1,
                        "first_blood_time": 1
                    },
                    title: (player.personaname || player.account_id) + " - YASP"
                });
            });
        });
    });
    players.get('/:account_id/:info?/:subkey?', function(req, res, next)
    {
        console.time("player " + req.params.account_id);
        var info = playerPages[req.params.info] ? req.params.info : "index";
        var account_id = req.params.account_id;
        var compare_data;
        if (Number(account_id) === constants.anonymous_account_id)
        {
            return next("cannot generate profile for anonymous account_id");
        }
        async.parallel(
        {
            "player": function(cb)
            {
                fillPlayerData(account_id,
                {
                    info: info,
                    queryObj:
                    {
                        select: req.query
                    }
                }, cb);
            },
            "sets": function(cb)
            {
                queries.getSets(redis, cb);
            },
            "ratings": function(cb)
            {
                queries.getPlayerRatings(db, account_id, cb);
            }
        }, function(err, result)
        {
            if (err)
            {
                return next(err);
            }
            var player = result.player;
            console.timeEnd("player " + req.params.account_id);
            if (req.query.json)
            {
                return res.json(result.player);
            }
            var ratings = result.ratings || [];
            player.soloRating = ratings[0] ? ratings[ratings.length - 1].solo_competitive_rank : null;
            player.partyRating = ratings[0] ? ratings[ratings.length - 1].competitive_rank : null;
            player.ratings = ratings;
            player.match_count = player.aggData.match_id.n;
            player.parsed_match_count = player.aggData.version.n;
            player.abandon_count = player.aggData.abandons.sum;
            player.win = player.aggData.win.sum;
            player.lose = player.aggData.lose.sum;
            res.render("player/player_" + info,
            {
                q: req.query,
                querystring: Object.keys(req.query).length ? "?" + querystring.stringify(req.query) : "",
                route: info,
                tabs: playerPages,
                player: player,
                trackedPlayers: result.sets.trackedPlayers,
                histograms: subkeys,
                subkey: req.params.subkey || "kills",
                times:
                {
                    "duration": 1,
                    "first_blood_time": 1
                },
                compare_data: compare_data,
                compare: info === "compare",
                title: (player.personaname || player.account_id) + " - YASP"
            });
        });
    });
    //return router
    return players;
    /*
        function doCompare(query, account_id, cb) {
            var account_ids = ["all", account_id];
            //var compareIds = query.compare_account_id;
            //compareIds = compareIds ? [].concat(compareIds) : [];
            //account_ids = account_ids.concat(compareIds).slice(0, 6);
            async.map(account_ids, function(account_id, cb) {
                //pass a copy of the original query, saved from before
                fillPlayerData(account_id, {
                    query: {
                        select: JSON.parse(JSON.stringify(query))
                    }
                }, function(err, player) {
                    console.log("computing averages %s", player.account_id);
                    //create array of results.aggData for each account_id
                    for (var key in histograms) {
                        //mean
                        //if (player.aggData[key].sum && player.aggData[key].n) {
                        //    player.aggData[key].avg = player.aggData[key].sum / player.aggData[key].n;
                        //}
                        //median
                        var arr = [];
                        for (var value in player.aggData[key].counts) {
                            for (var i = 0; i < player.aggData[key].counts[value]; i++) {
                                arr.push(Number(value));
                            }
                        }
                        arr.sort(function(a, b) {
                            return a - b;
                        });
                        player.aggData[key].avg = arr[Math.floor(arr.length / 2)];
                    }
                    cb(err, player);
                });
            }, function(err, results) {
                if (err) {
                    return cb(err);
                }
                console.time("computing percentiles");
                //compute percentile for each stat
                //for each stat average in each player's aggdata, iterate through all's stat counts and determine whether this average is gt/lt key, then add count to appropriate bucket. percentile is gt/(gt+lt)
                results.forEach(function(r, i) {
                    for (var key in histograms) {
                        var avg = results[i].aggData[key].avg;
                        var allCounts = results[0].aggData[key].counts;
                        var gt = 0;
                        var total = 0;
                        for (var value in allCounts) {
                            var valueCount = allCounts[value];
                            if (avg >= Number(value)) {
                                gt += valueCount;
                            }
                            total += valueCount;
                        }
                        results[i].aggData[key].percentile = total ? (gt / total) : 0;
                    }
                });
                console.timeEnd("computing percentiles");
                return cb(err, results);
            });
        }
    */
    function generateTeammateArrayFromHash(input, player, cb)
    {
        if (!input)
        {
            return cb();
        }
        console.time('teammate list');
        var teammates_arr = [];
        var teammates = input;
        for (var id in teammates)
        {
            var tm = teammates[id];
            id = Number(id);
            //don't include if anonymous, self or if few games together
            if (id !== Number(player.account_id) && id !== constants.anonymous_account_id && (tm.games >= 5))
            {
                teammates_arr.push(tm);
            }
        }
        teammates_arr.sort(function(a, b)
        {
            return b.games - a.games;
        });
        //limit to 200 max players
        teammates_arr = teammates_arr.slice(0, 200);
        async.each(teammates_arr, function(t, cb)
        {
            db.first().from('players').where(
            {
                account_id: t.account_id
            }).asCallback(function(err, row)
            {
                if (err || !row)
                {
                    return cb(err);
                }
                t.personaname = row.personaname;
                t.last_login = row.last_login;
                t.avatar = row.avatar;
                cb(err);
            });
        }, function(err)
        {
            console.timeEnd('teammate list');
            cb(err, teammates_arr);
        });
    }

    function validateCache(account_id, cache, cb)
    {
        if (!cache)
        {
            return cb();
        }
        if (!isNaN(account_id))
        {
            console.time("validate");
            db('player_matches').count().where(
            {
                account_id: Number(account_id)
            }).asCallback(function(err, count)
            {
                if (err)
                {
                    return cb(err);
                }
                count = Number(count[0].count);
                console.timeEnd("validate");
                //console.log(Object.keys(cache.aggData.matches).length, count);
                var cacheValid = cache && cache.aggData && cache.aggData.matches && Object.keys(cache.aggData.matches).length && Object.keys(cache.aggData.matches).length === count;
                return cb(err, cacheValid);
            });
        }
        else
        {
            //non-integer account_id (all/professional), skip validation (always valid)
            cb(null, true);
        }
    }

    function fillPlayerData(account_id, options, cb)
    {
        //options.info, the tab the player is on
        //options.queryObj, the query object to use
        var orig_account_id = account_id;
        account_id = Number(account_id);
        //select player_matches with this account_id
        options.queryObj.select.account_id = account_id;
        options.queryObj = preprocessQuery(options.queryObj, constants);
        var filter_exists = Object.keys(options.queryObj.js_select).length;
        //try to find player in db
        getPlayer(db, account_id, function(err, player)
        {
            if (err)
            {
                return cb(err);
            }
            player = player ||
            {
                account_id: account_id,
                personaname: account_id
            };
            if (filter_exists)
            {
                return cacheMiss();
            }
            readCache(orig_account_id, function(err, cache)
            {
                if (err)
                {
                    return cb(err);
                }
                //check count of matches in db to validate cache
                validateCache(account_id, cache, function(err, valid)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    if (!valid)
                    {
                        return cacheMiss();
                    }
                    else
                    {
                        console.log("player cache hit %s", player.account_id);
                        processResults(err, cache);
                    }
                });
            });

            function cacheMiss()
            {
                console.log("player cache miss %s", player.account_id);
                //we need to project everything to build a new cache, otherwise optimize and do a subset
                options.queryObj.project = config.ENABLE_PLAYER_CACHE ? everything : projections[options.info];
                options.queryObj.project = options.queryObj.project.concat(filter_exists ? filter : []);
                getPlayerMatches(db, options.queryObj, function(err, results)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    //save the cache
                    if (!filter_exists && player.account_id !== constants.anonymous_account_id)
                    {
                        writeCache(player.account_id, results, function(err)
                        {
                            processResults(err, results);
                        });
                    }
                    else
                    {
                        processResults(err, results);
                    }
                });
            }

            function processResults(err, cache)
            {
                if (err)
                {
                    return cb(err);
                }
                //unpack hash into array
                var arr = [];
                for (var key in cache.aggData.matches)
                {
                    arr.push(cache.aggData.matches[key]);
                }
                cache.aggData.matches = arr;
                //sort matches by descending match id for display
                cache.aggData.matches.sort(function(a, b)
                {
                    return Number(b.match_id) - Number(a.match_id);
                });
                player.aggData = cache.aggData;
                //convert heroes hash to array and sort
                var aggData = player.aggData;
                if (aggData.heroes)
                {
                    var heroes_arr = [];
                    var heroes = aggData.heroes;
                    for (var id in heroes)
                    {
                        var h = heroes[id];
                        heroes_arr.push(h);
                    }
                    heroes_arr.sort(function(a, b)
                    {
                        return b.games - a.games;
                    });
                    player.heroes_list = heroes_arr;
                }
                if (aggData.obs)
                {
                    //generally position data function is used to generate heatmap data for each player in a natch
                    //we use it here to generate a single heatmap for aggregated counts
                    player.obs = aggData.obs.counts;
                    player.sen = aggData.sen.counts;
                    var d = {
                        "obs": true,
                        "sen": true
                    };
                    generatePositionData(d, player);
                    player.posData = [d];
                }
                async.parallel(
                {
                    //the array of teammates under the filter condition
                    teammate_list: function(cb)
                    {
                        if (options.info === "peers")
                        {
                            generateTeammateArrayFromHash(aggData.teammates, player, function(err, result)
                            {
                                player.teammate_list = result;
                                return cb(err);
                            });
                        }
                        else
                        {
                            return cb();
                        }
                    },
                    fill_skill: function(cb)
                    {
                        if (options.info === "index" || options.info === "matches")
                        {
                            //fill in skill data from table (only necessary if reading from cache since adding skill data doesn't update cache)
                            console.time('fillskill');
                            //get skill data for matches within cache expiry (might not have skill data)
                            var recents = player.aggData.matches.filter(function(m)
                            {
                                return moment().diff(moment.unix(m.start_time), 'days') <= config.UNTRACK_DAYS;
                            });
                            var skillMap = {};
                            async.each(recents, function(match, cb)
                            {
                                db.first(['match_id', 'skill']).from('match_skill').where(
                                {
                                    match_id: match.match_id
                                }).asCallback(function(err, row)
                                {
                                    if (row && row.skill)
                                    {
                                        skillMap[match.match_id] = row.skill;
                                    }
                                    return cb(err);
                                });
                            }, function(err)
                            {
                                player.aggData.matches.forEach(function(m)
                                {
                                    m.skill = m.skill || skillMap[m.match_id];
                                });
                                console.timeEnd('fillskill');
                                cb(err);
                            });
                        }
                        else
                        {
                            return cb();
                        }
                    }
                }, function(err)
                {
                    cb(err, player);
                });
            }
        });
    }
};
