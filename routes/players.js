var express = require('express');
var players = express.Router();
var async = require('async');
var constants = require('../constants.js');
var queries = require("../queries");
var getPlayerMatches = queries.getPlayerMatches;
var getPlayer = queries.getPlayer;
var utility = require('../utility');
var generatePositionData = utility.generatePositionData;
var config = require('../config');
var preprocessQuery = utility.preprocessQuery;
var querystring = require('querystring');
var moment = require('moment');
var util = require('util');
var playerCache = require('../playerCache');
var readCache = playerCache.readCache;
var writeCache = playerCache.writeCache;
//list of fields that are numerical (continuous).  These define the possible categories for histograms, trends, and records
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
//list of fields that are categorical (discrete).  These define the possible categories for counts.
var countCats = {
    "leaver_status": 1,
    "game_mode": 1,
    "lobby_type": 1,
    "lane_role": 1,
    "region": 1,
    "patch": 1
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
    records: basic.concat(advanced).concat(['purchase', 'kill_streaks', 'multi_kills']),
    trends: basic.concat(advanced).concat(['purchase']),
    wardmap: basic.concat(['obs', 'sen']),
    items: basic.concat(['purchase', 'purchase_log', 'item_uses']),
    skills: basic.concat(['hero_hits', 'ability_uses']),
    wordcloud: basic.concat('chat'),
    rating: basic,
    rankings: basic,
};
var basicAggs = ['match_id', 'version', 'abandons', 'win', 'lose'];
var aggs = {
    index: basicAggs.concat('heroes'),
    matches: basicAggs,
    heroes: basicAggs.concat('heroes'),
    peers: basicAggs.concat('teammates'),
    activity: basicAggs.concat('start_time'),
    histograms: basicAggs.concat(Object.keys(subkeys)),
    records: basicAggs.concat(Object.keys(subkeys)).concat(Object.keys(countCats)).concat(['multi_kills', 'kill_streaks']),
    trends: basicAggs.concat(Object.keys(subkeys)),
    wardmap: basicAggs.concat(['obs', 'sen']),
    items: basicAggs.concat(['purchase_time', 'item_usage', 'item_uses', 'purchase', 'item_win']),
    skills: basicAggs.concat(['hero_hits', 'ability_uses']),
    wordcloud: basicAggs.concat(['my_word_counts', 'all_word_counts']),
    rating: basicAggs,
    rankings: basicAggs,
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
var significant = util.format("game_mode in (%s) and lobby_type in (%s) and radiant_win is not null and duration > 300", sigModes.join(","), sigLobbies.join(","));
var playerPages = constants.player_pages;
module.exports = function(db, redis)
{
    players.get('/:account_id/:info?/:subkey?', function(req, res, next)
    {
        console.time("player " + req.params.account_id);
        var info = playerPages[req.params.info] ? req.params.info : "index";
        var subkey = req.params.subkey || "kills";
        var account_id = req.params.account_id;
        var compare_data;
        if (Number.isNaN(account_id))
        {
            return next("non-numeric account_id");
        }
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
                    },
                    sql: req.query.sql
                }, cb);
            },
            "sets": function(cb)
            {
                queries.getSets(redis, cb);
            },
            "ratings": function(cb)
            {
                queries.getPlayerRatings(db, account_id, cb);
            },
            "rankings": function(cb)
            {
                if (info === "rankings")
                {
                    async.map(Object.keys(constants.heroes), function(hero_id, cb)
                    {
                        redis.zcard('hero_rankings:' + hero_id, function(err, card)
                        {
                            if (err)
                            {
                                return cb(err);
                            }
                            redis.zrank('hero_rankings:' + hero_id, account_id, function(err, rank)
                            {
                                cb(err,
                                {
                                    hero_id: hero_id,
                                    rank: rank,
                                    card: card
                                });
                            });
                        });
                    }, cb);
                }
                else
                {
                    return cb();
                }
            }
        }, function(err, result)
        {
            if (err)
            {
                return next(err);
            }
            var player = result.player;
            var ratings = result.ratings || [];
            player.soloRating = ratings[0] ? ratings[ratings.length - 1].solo_competitive_rank : null;
            player.partyRating = ratings[0] ? ratings[ratings.length - 1].competitive_rank : null;
            player.ratings = ratings;
            player.rankings = result.rankings;
            delete req.query.account_id;
            console.timeEnd("player " + req.params.account_id);
            if (req.query.json)
            {
                delete result.player.aggData.teammates;
                return res.json(result.player);
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
                subkey: subkey,
                times:
                {
                    "duration": 1,
                    "first_blood_time": 1
                },
                counts: countCats,
                compare_data: compare_data,
                compare: info === "compare",
                title: (player.personaname || player.account_id) + " - YASP"
            });
        });
    });
    //return router
    return players;

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
        if (!Number.isNaN(account_id))
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
                //console.log(cache);
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

    function fillSkill(matches, options, cb)
    {
        //fill in skill data from table (only necessary if reading from cache since adding skill data doesn't update cache)
        console.time('fillskill');
        //get skill data for matches within cache expiry (might not have skill data)
        var recents = matches.filter(function(m)
        {
            return moment().diff(moment.unix(m.start_time), 'days') <= config.UNTRACK_DAYS;
        });
        var skillMap = {};
        db.select(['match_id', 'skill']).from('match_skill').whereIn('match_id', recents.map(function(m)
        {
            return m.match_id;
        })).asCallback(function(err, rows)
        {
            if (err)
            {
                return cb(err);
            }
            console.log("fillskill recents: %s, results: %s", recents.length, rows.length);
            rows.forEach(function(match)
            {
                skillMap[match.match_id] = match.skill;
            });
            matches.forEach(function(m)
            {
                m.skill = m.skill || skillMap[m.match_id];
            });
            console.timeEnd('fillskill');
            return cb(err);
        });
    }

    function doSqlAgg(player, query, cb)
    {
        //TODO fully sql aggs
        //disable or fix special filters: with/against/included, purchased_item, lane_role, patch, region, faction, win
        //make histograms/records/trends work
        //add significance check to all queries
        //get 20k matches if info is matches, else 20
        console.log(query);
        async.parallel(
        {
            matches: function(cb)
            {
                console.time('t');
                db.select(basic).select(db.raw('(player_slot < 64) = radiant_win as player_win')).from('player_matches').join('matches', 'matches.match_id', 'player_matches.match_id').leftJoin('match_skill', 'player_matches.match_id', "match_skill.match_id").where(query).orderBy('match_id', 'desc').limit(20).asCallback(function(err, matches)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    console.timeEnd('t');
                    cb(err, matches);
                });
            },
            heroes: function(cb)
            {
                db('player_matches').select(db.raw("hero_id, max(start_time) as last_played, count(*) as games, sum(case when radiant_win = (player_slot < 64) then 1 else 0 end) as win")).join(db.raw("matches on matches.match_id = player_matches.match_id")).whereRaw(significant).where(query).groupBy("hero_id").orderBy("games", "desc").asCallback(cb);
            },
            counts: function(cb)
            {
                db('player_matches').select(db.raw("sum(case when radiant_win = (player_slot < 64) then 1 else 0 end) as win, sum(case when radiant_win = (player_slot < 64) then 0 else 1 end) as lose, sum(case when leaver_status > 1 then 1 else 0 end) as abandon_count, count(*) as match_count, sum(case when version > 0 then 1 else 0 end) as parsed_match_count")).join(db.raw("matches on player_matches.match_id = matches.match_id")).whereRaw(significant).where(query).asCallback(cb);
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
        }, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            player.aggData = {
                matches: result.matches
            };
            player.match_count = result.counts[0].match_count;
            player.parsed_match_count = result.counts[0].parsed_match_count;
            player.abandon_count = result.counts[0].abandon_count;
            player.win = result.counts[0].win;
            player.lose = result.counts[0].lose;
            player.heroes_list = result.heroes;
            //player.heroes_with = result.heroes_with.rows;
            //player.heroes_against = result.heroes_against.rows;
            //player.players_with = result.players_with.rows;
            //player.players_against = result.players_against.rows;
            cb(err, player);
        });
    }

    function fillPlayerData(account_id, options, cb)
    {
        //options.info, the tab the player is on
        //options.queryObj, the query object to use
        //options.sql, use sql aggregation
        //options.cache, using cache
        var orig_account_id = account_id;
        account_id = Number(account_id);
        //select player_matches with this account_id
        options.queryObj.select.account_id = account_id;
        //project fields to aggregate based on tab
        var obj = {};
        aggs[options.info].forEach(function(k)
        {
            obj[k] = 1;
        });
        options.queryObj.js_agg = obj;
        options.queryObj = preprocessQuery(options.queryObj, constants);
        var filter_exists = options.queryObj.filter_count > 1;
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
            if (options.sql)
            {
                doSqlAgg(player, options.queryObj.db_select, cb);
            }
            else
            {
                if (filter_exists && !config.CASSANDRA_PLAYER_CACHE)
                {
                    console.log("filter exists");
                    return cacheMiss();
                }
                readCache(orig_account_id, options.queryObj, function(err, cache)
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
                            options.cache = true;
                            processResults(err, cache);
                        }
                    });
                });
            }

            function cacheMiss()
            {
                console.log("player cache miss %s", player.account_id);
                //we need to project everything to build a new cache, otherwise optimize and do a subset
                options.queryObj.project = config.ENABLE_PLAYER_CACHE ? everything : projections[options.info];
                options.queryObj.project = options.queryObj.project.concat(filter_exists ? filter : []);
                console.time('getting player_matches');
                getPlayerMatches(db, options.queryObj, function(err, results)
                {
                    console.timeEnd('getting player_matches');
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
                player.aggData = cache.aggData;
                var aggData = player.aggData;
                async.parallel(
                {
                    unpack: function(cb)
                    {
                        if (options.info === "index" || options.info === "matches")
                        {
                            var matches = aggData.matches;
                            //unpack hash into array
                            var arr = [];
                            for (var key in matches)
                            {
                                arr.push(matches[key]);
                            }
                            aggData.matches = arr;
                            //sort matches by descending match id for display
                            aggData.matches.sort(function(a, b)
                            {
                                return Number(b.match_id) - Number(a.match_id);
                            });
                            if (options.cache)
                            {
                                fillSkill(aggData.matches, options, cb);
                            }
                            else
                            {
                                cb();
                            }
                        }
                        else
                        {
                            cb();
                        }
                    },
                    others: function(cb)
                    {
                        if (options.info === "index" || options.info === "heroes")
                        {
                            //convert heroes hash to array and sort
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
                        }
                        if (aggData.obs && options.info === "wardmap")
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
                        cb();
                    },
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
                    }
                }, function(err)
                {
                    player.match_count = player.aggData.match_id.n;
                    player.parsed_match_count = player.aggData.version.n;
                    player.abandon_count = player.aggData.abandons.sum;
                    player.win = player.aggData.win.sum;
                    player.lose = player.aggData.lose.sum;
                    cb(err, player);
                });
            }
        });
    }
};
