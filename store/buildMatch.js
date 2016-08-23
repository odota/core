/**
 * Functions to build/cache match object
 **/
var config = require('../config');
var async = require('async');
var queries = require('./queries');
var compute = require('../util/compute');
var utility = require('../util/utility');
var getMatchRating = queries.getMatchRating;
var computeMatchData = compute.computeMatchData;
var deserialize = utility.deserialize;

function buildMatch(options, cb)
{
    var db = options.db;
    var redis = options.redis;
    var match_id = options.match_id;
    var key = "match:" + match_id;
    redis.get(key, function (err, reply)
    {
        if (err)
        {
            return cb(err);
        }
        else if (reply)
        {
            console.log("Cache hit for match " + match_id);
            var match = JSON.parse(reply);
            return cb(err, match);
        }
        else
        {
            console.log("Cache miss for match " + match_id);
            getMatch(db, redis, match_id, options, function (err, match)
            {
                if (err)
                {
                    return cb(err);
                }
                if (!match)
                {
                    return cb();
                }
                if (match.version && config.ENABLE_MATCH_CACHE)
                {
                    redis.setex(key, 1800, JSON.stringify(match));
                }
                return cb(err, match);
            });
        }
    });
}

function getMatch(db, redis, match_id, options, cb)
{
    getMatchData(match_id, function (err, match)
    {
        if (err)
        {
            return cb(err);
        }
        else if (!match)
        {
            return cb();
        }
        else
        {
            async.parallel(
            {
                "players": function (cb)
                {
                    getPlayerMatchData(match_id, cb);
                },
                "ab_upgrades": function (cb)
                {
                    redis.get('ability_upgrades:' + match_id, cb);
                },
                "gcdata": function (cb)
                {
                    db.first().from('match_gcdata').where(
                    {
                        match_id: match_id
                    }).asCallback(cb);
                },
                "skill": function (cb)
                {
                    db.first().from('match_skill').where(
                    {
                        match_id: match_id
                    }).asCallback(cb);
                }
            }, function (err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                var players = result.players;
                var ab_upgrades = JSON.parse(result.ab_upgrades);
                match = Object.assign(
                {}, result.gcdata, match);
                match.replay_url = utility.buildReplayUrl(match.match_id, match.cluster, match.replay_salt);
                match = Object.assign({}, match, result.skill);
                async.each(players, function (p, cb)
                {
                    //match-level columns
                    p.radiant_win = match.radiant_win;
                    p.start_time = match.start_time;
                    p.duration = match.duration;
                    p.cluster = match.cluster;
                    p.lobby_type = match.lobby_type;
                    p.game_mode = match.game_mode;
                    computeMatchData(p);
                    if (ab_upgrades)
                    {
                        p.ability_upgrades_arr = ab_upgrades[p.player_slot];
                    }
                    redis.zscore('solo_competitive_rank', p.account_id || "", function (err, rating)
                    {
                        p.solo_competitive_rank = rating;
                        return cb(err);
                    });
                }, function (err)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    match.players = players;
                    computeMatchData(match);
                    getMatchRating(redis, match, function (err, avg)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        var key = 'match_ratings:' + utility.getStartOfBlockHours(config.MATCH_RATING_RETENTION_HOURS, config.NODE_ENV === "development" ? 0 : -1);
                        redis.zcard(key, function (err, card)
                        {
                            if (err)
                            {
                                return cb(err);
                            }
                            redis.zcount(key, 0, avg, function (err, count)
                            {
                                if (err)
                                {
                                    return cb(err);
                                }
                                match.rating = avg;
                                match.rating_percentile = Number(count) / Number(card);
                                queries.getMatchBenchmarks(redis, match, function (err)
                                {
                                    return cb(err, match);
                                });
                            });
                        });
                    });
                });
            });
        }
    });

    function getMatchData(match_id, cb)
    {
        if (options.cassandra)
        {
            options.cassandra.execute(`SELECT * FROM matches where match_id = ?`, [Number(match_id)],
            {
                prepare: true,
                fetchSize: 10,
                autoPage: true,
            }, function (err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                result = result.rows.map(function (m)
                {
                    return deserialize(m);
                });
                return cb(err, result[0]);
            });
        }
        else
        {
            db.first(['matches.match_id', 'match_skill.skill', 'radiant_win', 'start_time', 'duration', 'tower_status_dire', 'tower_status_radiant', 'barracks_status_dire', 'barracks_status_radiant', 'cluster', 'lobby_type', 'leagueid', 'game_mode', 'picks_bans', 'chat', 'teamfights', 'objectives', 'radiant_gold_adv', 'radiant_xp_adv', 'version']).from('matches').leftJoin('match_skill', 'matches.match_id', 'match_skill.match_id').where(
            {
                "matches.match_id": Number(match_id)
            }).asCallback(cb);
        }
    }

    function getPlayerMatchData(match_id, cb)
    {
        if (options.cassandra)
        {
            options.cassandra.execute(`SELECT * FROM player_matches where match_id = ?`, [Number(match_id)],
            {
                prepare: true,
                fetchSize: 10,
                autoPage: true,
            }, function (err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                result = result.rows.map(function (m)
                {
                    return deserialize(m);
                });
                //get personanames
                async.map(result, function (r, cb)
                {
                    db.raw(`SELECT personaname, last_login FROM players WHERE account_id = ?`, [r.account_id]).asCallback(function (err, names)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        if (names.rows[0])
                        {
                            for (var key in names.rows[0])
                            {
                                r[key] = names.rows[0][key];
                            }
                        }
                        return cb(err, r);
                    });
                }, cb);
            });
        }
        else
        {
            db.select(['personaname', 'last_login', 'player_matches.match_id', 'player_matches.account_id', 'player_slot', 'hero_id', 'item_0', 'item_1', 'item_2', 'item_3', 'item_4', 'item_5', 'kills', 'deaths', 'assists', 'leaver_status', 'gold', 'last_hits', 'denies', 'gold_per_min', 'xp_per_min', 'gold_spent', 'hero_damage', 'tower_damage', 'hero_healing', 'level', 'additional_units', 'stuns', 'max_hero_hit', 'times', 'gold_t', 'lh_t', 'dn_t', 'xp_t', 'obs_log', 'sen_log', 'purchase_log', 'kills_log', 'buyback_log', 'lane_pos', 'obs', 'sen', 'actions', 'pings', 'purchase', 'gold_reasons', 'xp_reasons', 'killed', 'item_uses', 'ability_uses', 'hero_hits', 'damage', 'damage_taken', 'damage_inflictor', 'runes', 'killed_by', 'kill_streaks', 'multi_kills', 'life_state']).from('player_matches').where(
            {
                "player_matches.match_id": Number(match_id)
            }).leftJoin('players', 'player_matches.account_id', 'players.account_id').orderBy("player_slot", "asc").asCallback(cb);
        }
    }
}
module.exports = buildMatch;
