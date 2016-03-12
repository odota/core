module.exports = buildPlayer;
var async = require('async');
var moment = require('moment');
var constants = require('./constants.js');
var queries = require("./queries");
var utility = require('./utility');
var config = require('./config');
var playerCache = require('./playerCache');
var getPlayerMatches = queries.getPlayerMatches;
var getPlayer = queries.getPlayer;
var generatePositionData = utility.generatePositionData;
var preprocessQuery = utility.preprocessQuery;
var readCache = playerCache.readCache;
var writeCache = playerCache.writeCache;
var player_fields = constants.player_fields;
var subkeys = player_fields.subkeys;
var countCats = player_fields.countCats;
//optimize by only projecting certain columns based on tab
//set query.project based on this
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
//optimize by only aggregating certain columns based on tab
//set query.js_agg based on this
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

function buildPlayer(options, cb)
{
    var db = options.db;
    var redis = options.redis;
    var account_id = options.account_id;
    var info = options.info;
    var subkey = options.subkey;
    var query = options.query;
    if (Number.isNaN(account_id))
    {
        return cb("non-numeric account_id");
    }
    if (Number(account_id) === constants.anonymous_account_id)
    {
        return cb("cannot generate profile for anonymous account_id");
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
                    select: query
                },
                db: db
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
            return cb(err);
        }
        var player = result.player;
        var ratings = result.ratings || [];
        player.soloRating = ratings[0] ? ratings[ratings.length - 1].solo_competitive_rank : null;
        player.partyRating = ratings[0] ? ratings[ratings.length - 1].competitive_rank : null;
        player.ratings = ratings;
        player.rankings = result.rankings;
        player.tracked = (player.account_id in result.sets.trackedPlayers);
        player.match_count = player.aggData.match_id.n;
        player.parsed_match_count = player.aggData.version.n;
        player.abandon_count = player.aggData.abandons.sum;
        player.win = player.aggData.win.sum;
        player.lose = player.aggData.lose.sum;
        return cb(err, player);
    });
}

function generateTeammateArrayFromHash(db, input, player, cb)
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

function validateCache(db, account_id, cache, cb)
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

function fillSkill(db, matches, options, cb)
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
/**
 * Get player object from db
 * Get matches played by player
 **/
function fillPlayerData(account_id, options, cb)
{
    var db = options.db;
    //options.info, the tab the player is on
    //options.queryObj, the query object to use
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
    //1 filter expected for account id
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
            validateCache(db, account_id, cache, function(err, valid)
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
                unpackAndSkill: function(cb)
                {
                    if (options.info === "index" || options.info === "matches")
                    {
                        //unpack hash of matches into array
                        var matches = aggData.matches;
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
                            fillSkill(db, aggData.matches, options, cb);
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
                postProcess: function(cb)
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
                        generateTeammateArrayFromHash(db, aggData.teammates, player, function(err, result)
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
                cb(err, player);
            });
        }
    });
}