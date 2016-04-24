var async = require('async');
var utility = require('./utility');
var convert64to32 = utility.convert64to32;
var compute = require('./compute');
var computePlayerMatchData = compute.computePlayerMatchData;
var computeMatchData = compute.computeMatchData;
var renderMatch = compute.renderMatch;
var benchmarkMatch = require('./benchmarkMatch');
var moment = require('moment');
var config = require('./config');
var constants = require('./constants');
var benchmarks = require('./benchmarks');
var filter = require('./filter');
var util = require('util');
var queue = require('./queue');
var cQueue = queue.getQueue('cache');
var pQueue = queue.getQueue('parse');
var getMatchRating = require('./getMatchRating');
var playerCache = require('./playerCache');
var updateCache = playerCache.updateCache;
var serialize = utility.serialize;
var deserialize = utility.deserialize;
var columnInfo = {};

function getSets(redis, cb)
{
    async.parallel(
    {
        "trackedPlayers": function(cb)
        {
            redis.get("trackedPlayers", function(err, tps)
            {
                cb(err, JSON.parse(tps || "{}"));
            });
        },
        "userPlayers": function(cb)
        {
            redis.get("userPlayers", function(err, ups)
            {
                cb(err, JSON.parse(ups || "{}"));
            });
        },
        "donators": function(cb)
        {
            redis.get("donators", function(err, ds)
            {
                cb(err, JSON.parse(ds || "{}"));
            });
        }
    }, function(err, results)
    {
        cb(err, results);
    });
}

function getColumnInfo(db, table, cb)
{
    if (columnInfo[table])
    {
        return cb();
    }
    else
    {
        db(table).columnInfo().asCallback(function(err, result)
        {
            columnInfo[table] = result;
            cb(err);
        });
    }
}

function cleanRow(db, table, row, cb)
{
    getColumnInfo(db, table, function(err)
    {
        if (err)
        {
            return cb(err);
        }
        for (var key in row)
        {
            if (!(key in columnInfo[table]))
            {
                delete row[key];
                //console.error(key);
            }
        }
        cb(err, row);
    });
}

function upsert(db, table, row, conflict, cb)
{
    cleanRow(db, table, row, function(err)
    {
        if (err)
        {
            return cb(err);
        }
        var values = Object.keys(row).map(function(key)
        {
            return '?';
        });
        var update = Object.keys(row).map(function(key)
        {
            return util.format("%s=%s", key, "EXCLUDED." + key);
        });
        var query = util.format("INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET %s", table, Object.keys(row).join(','), values, Object.keys(conflict).join(','), update.join(','));
        //require('fs').writeFileSync('output.json', query);
        db.raw(query, Object.keys(row).map(function(key)
        {
            return row[key];
        })).asCallback(cb);
    });
}

function insertMatch(db, redis, match, options, cb)
{
    var players = match.players ? JSON.parse(JSON.stringify(match.players)) : undefined;
    //don't insert anonymous account id
    players.forEach(function(p)
    {
        if (p.account_id === constants.anonymous_account_id)
        {
            delete p.account_id;
        }
    });
    //build match.pgroup so after parse we can figure out the player ids for each slot (for caching update without db read)
    if (players && !match.pgroup)
    {
        match.pgroup = {};
        players.forEach(function(p, i)
        {
            match.pgroup[p.player_slot] = {
                account_id: p.account_id,
                hero_id: p.hero_id,
                player_slot: p.player_slot
            };
        });
    }
    //put ability_upgrades data in redis
    if (players && players[0] && players[0].ability_upgrades && !options.skipAbilityUpgrades)
    {
        var ability_upgrades = {};
        players.forEach(function(p)
        {
            ability_upgrades[p.player_slot] = p.ability_upgrades ? p.ability_upgrades.map(function(au)
            {
                return au.ability;
            }) : null;
        });
        redis.setex("ability_upgrades:" + match.match_id, 60 * 60 * 24 * 1, JSON.stringify(ability_upgrades));
    }
    //options.type specify api, parse, or skill
    //we want to insert into matches, then insert into player_matches for each entry in players
    async.series(
    {
        "u": upsertMatch,
        "uc": upsertMatchCassandra,
        "upc": updatePlayerCaches,
        "cmc": clearMatchCache,
        "t": telemetry,
        "dp": decideParse
    }, function(err, results)
    {
        return cb(err, results.dp);
    });

    function upsertMatch(cb)
    {
        db.transaction(function(trx)
        {
            upsert(trx, 'matches', match,
            {
                match_id: match.match_id
            }, function(err)
            {
                if (err)
                {
                    return exit(err);
                }
                async.each(players || [], function(pm, cb)
                {
                    pm.match_id = match.match_id;
                    upsert(trx, 'player_matches', pm,
                    {
                        match_id: pm.match_id,
                        player_slot: pm.player_slot
                    }, cb);
                }, exit);

                function exit(err)
                {
                    if (err)
                    {
                        console.error(err);
                        trx.rollback(err);
                    }
                    else
                    {
                        trx.commit();
                    }
                    cb(err);
                }
            });
        });
    }

    function upsertMatchCassandra(cb)
    {
        var cassandra = options.cassandra;
        if (!cassandra)
        {
            return cb();
        }
        //TODO update callers of insertMatch (scanner, requests, parser, fullhistory) to pass options.cassandra
        //TODO clean based on cassandra schema
        //SELECT column_name FROM system_schema.columns WHERE keyspace_name = 'yasp' AND table_name = 'player_matches'
        //TODO disable validateCache if using full cassandra
        var obj = serialize(match);
        var query = 'INSERT INTO matches JSON ?';
        var arr = [JSON.stringify(obj)];
        /*
        var query = util.format('INSERT INTO matches (%s) VALUES (%s)', Object.keys(obj).join(','), Object.keys(obj).map(function(k)
        {
            return '?';
        }).join(','));
        var arr = Object.keys(obj).map(function(k)
        {
            return obj[k];
        });
        */
        cassandra.execute(query, arr,
        {
            prepare: true
        }, function(err, results)
        {
            if (err)
            {
                return cb(err);
            }
            async.each(players || [], function(pm, cb)
            {
                //denormalized columns for efficiency
                pm.match_id = match.match_id;
                pm.radiant_win = match.radiant_win;
                pm.start_time = match.start_time;
                pm.duration = match.duration;
                pm.cluster = match.cluster;
                pm.lobby_type = match.lobby_type;
                pm.game_mode = match.game_mode;
                pm.parse_status = match.parse_status;
                var obj2 = serialize(pm);
                var query2 = 'INSERT INTO player_matches JSON ?';
                var arr2 = [JSON.stringify(obj2)];
                /*
                var query2 = util.format('INSERT INTO player_matches (%s) VALUES (%s)', Object.keys(obj2).join(','), Object.keys(obj2).map(function(k)
                {
                    return '?';
                }).join(','));
                var arr2 = Object.keys(obj2).map(function(k)
                {
                    return obj2[k];
                });
                */
                cassandra.execute(query2, arr2,
                {
                    prepare: true
                }, cb);
            }, cb);
        });
    }

    function updatePlayerCaches(cb)
    {
        if (options.skipCacheUpdate)
        {
            return cb();
        }
        var copy = JSON.parse(JSON.stringify(match));
        copy.players = players;
        copy.insert_type = options.type;
        copy.origin = options.origin;
        updateCache(copy, function(err)
        {
            if (err)
            {
                return cb(err);
            }
            queue.addToQueue(cQueue, copy,
            {
                attempts: 1
            }, cb);
        });
    }

    function telemetry(cb)
    {
        var types = {
            "api": 'matches_last_added',
            "parsed": 'matches_last_parsed'
        };
        console.log(options.type);
        if (types[options.type])
        {
            redis.rpush(types[options.type], JSON.stringify(
            {
                match_id: match.match_id,
                duration: match.duration,
                start_time: match.start_time
            }));
            redis.ltrim(types[options.type], -10, -1);
        }
        return cb();
    }

    function clearMatchCache(cb)
    {
        redis.del("match:" + match.match_id, cb);
    }

    function decideParse(cb)
    {
        if (match.parse_status !== 0)
        {
            //not parsing this match
            //this isn't a error, although we want to report that we refused to parse back to user if it was a request
            return cb();
        }
        else
        {
            //queue it and finish, callback with the queued parse job
            return queue.addToQueue(pQueue, match, options, function(err, job2)
            {
                cb(err, job2);
            });
        }
    }
}

function insertPlayer(db, player, cb)
{
    if (player.steamid)
    {
        //this is a login, compute the account_id from steamid
        player.account_id = Number(convert64to32(player.steamid));
    }
    if (!player.account_id || player.account_id === constants.anonymous_account_id)
    {
        return cb();
    }
    upsert(db, 'players', player,
    {
        account_id: player.account_id
    }, cb);
}

function insertPlayerRating(db, row, cb)
{
    db('player_ratings').insert(row).asCallback(cb);
}

function insertMatchSkill(db, row, cb)
{
    upsert(db, 'match_skill', row,
    {
        match_id: row.match_id
    }, cb);
}

function getMatch(db, redis, match_id, options, cb)
{
    db.first(['matches.match_id', 'match_skill.skill', 'radiant_win', 'start_time', 'duration', 'tower_status_dire', 'tower_status_radiant', 'barracks_status_dire', 'barracks_status_radiant', 'cluster', 'lobby_type', 'leagueid', 'game_mode', 'picks_bans', 'parse_status', 'chat', 'teamfights', 'objectives', 'radiant_gold_adv', 'radiant_xp_adv', 'version']).from('matches').leftJoin('match_skill', 'matches.match_id', 'match_skill.match_id').where(
    {
        "matches.match_id": Number(match_id)
    }).asCallback(function(err, match)
    {
        if (err)
        {
            return cb(err);
        }
        else if (!match)
        {
            return cb("match not found");
        }
        else
        {
            async.parallel(
            {
                "players": function(cb)
                {
                    if (options.cassandra)
                    {
                        options.cassandra.execute(`SELECT * FROM player_matches where match_id = ?`, [Number(match_id)],
                        {
                            prepare: true,
                            fetchSize: 10,
                            autoPage: true,
                        }, function(err, result)
                        {
                            if (err)
                            {
                                return cb(err);
                            }
                            result = result.rows.map(function(m)
                            {
                                return deserialize(m);
                            });
                            //TODO get personanames
                            return cb(err, result);
                        });
                    }
                    else
                    {
                        db.select(['personaname', 'last_login', 'player_matches.match_id', 'player_matches.account_id', 'player_slot', 'hero_id', 'item_0', 'item_1', 'item_2', 'item_3', 'item_4', 'item_5', 'kills', 'deaths', 'assists', 'leaver_status', 'gold', 'last_hits', 'denies', 'gold_per_min', 'xp_per_min', 'gold_spent', 'hero_damage', 'tower_damage', 'hero_healing', 'level', 'additional_units', 'stuns', 'max_hero_hit', 'times', 'gold_t', 'lh_t', 'xp_t', 'obs_log', 'sen_log', 'purchase_log', 'kills_log', 'buyback_log', 'lane_pos', 'obs', 'sen', 'actions', 'pings', 'purchase', 'gold_reasons', 'xp_reasons', 'killed', 'item_uses', 'ability_uses', 'hero_hits', 'damage', 'damage_taken', 'damage_inflictor', 'runes', 'killed_by', 'kill_streaks', 'multi_kills', 'life_state']).from('player_matches').where(
                        {
                            "player_matches.match_id": Number(match_id)
                        }).leftJoin('players', 'player_matches.account_id', 'players.account_id').orderBy("player_slot", "asc").asCallback(cb);
                    }
                },
                "ab_upgrades": function(cb)
                {
                    redis.get('ability_upgrades:' + match_id, cb);
                },
            }, function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                var players = result.players;
                var ab_upgrades = JSON.parse(result.ab_upgrades);
                async.each(players, function(p, cb)
                {
                    //denormalized columns
                    p.radiant_win = match.radiant_win;
                    p.start_time = match.start_time;
                    p.duration = match.duration;
                    p.cluster = match.cluster;
                    p.lobby_type = match.lobby_type;
                    p.game_mode = match.game_mode;
                    p.parse_status = match.parse_status;
                    computePlayerMatchData(p);
                    if (ab_upgrades)
                    {
                        p.ability_upgrades_arr = ab_upgrades[p.player_slot];
                    }
                    redis.zscore('solo_competitive_rank', p.account_id || "", function(err, rating)
                    {
                        p.solo_competitive_rank = rating;
                        return cb(err);
                    });
                }, function(err)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    match.players = players;
                    computeMatchData(match);
                    renderMatch(match);
                    getMatchRating(redis, match, function(err, avg)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        var key = 'match_ratings:' + utility.getStartOfBlockHours(config.MATCH_RATING_RETENTION_HOURS, config.NODE_ENV === "development" ? 0 : -1);
                        redis.zcard(key, function(err, card)
                        {
                            if (err)
                            {
                                return cb(err);
                            }
                            redis.zcount(key, 0, avg, function(err, count)
                            {
                                if (err)
                                {
                                    return cb(err);
                                }
                                match.rating = avg;
                                match.rating_percentile = Number(count) / Number(card);
                                benchmarkMatch(redis, match, function(err)
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
}

function getPlayerMatches(db, queryObj, options, cb)
{
    var stream;
    if (options.cassandra)
    {
        //remove any compound names
        queryObj.project = queryObj.project.map(function(k)
        {
            var split = k.split('.');
            return split[split.length - 1];
        });
        var extraProps = {
            chat: false,
            radiant_gold_adv: false,
            pgroup: false,
        };
        //remove props not in cassandra table
        queryObj.project = queryObj.project.filter(function(k)
        {
            if (k in extraProps)
            {
                extraProps[k] = true;
                return false;
            }
            return true;
        });
        stream = options.cassandra.stream(util.format(`SELECT %s FROM player_matches where account_id = ?`, queryObj.project.join(',')), [queryObj.db_select.account_id],
        {
            prepare: true,
            fetchSize: 1000,
            autoPage: true,
        });
    }
    else
    {
        stream = db.select(queryObj.project).from('player_matches').where(queryObj.db_select).limit(queryObj.limit).innerJoin('matches', 'player_matches.match_id', 'matches.match_id').leftJoin('match_skill', 'player_matches.match_id', 'match_skill.match_id').stream();
    }
    var matches = [];
    stream.on('end', function(err)
    {
        if (options.cassandra)
        {
            //TODO get extra columns if needed from match table based on queryObj.project
        }
        cb(err,
        {
            raw: matches
        });
    });
    stream.on('data', function(m)
    {
        if (options.cassandra)
        {
            m = deserialize(m);
        }
        computePlayerMatchData(m);
        if (filter([m], queryObj.js_select).length)
        {
            matches.push(m);
        }
    });
    stream.on('error', function(err)
    {
        throw err;
    });
}

function getPlayerRatings(db, account_id, cb)
{
    console.time('[PLAYER] getPlayerRatings ' + account_id);
    if (!Number.isNaN(account_id))
    {
        db.from('player_ratings').where(
        {
            account_id: Number(account_id)
        }).orderBy('time', 'asc').asCallback(function(err, result)
        {
            console.timeEnd('[PLAYER] getPlayerRatings ' + account_id);
            cb(err, result);
        });
    }
    else
    {
        cb();
    }
}

function getPlayerRankings(redis, account_id, cb)
{
    console.time('[PLAYER] getPlayerRankings ' + account_id);
    async.map(Object.keys(constants.heroes), function(hero_id, cb)
    {
        redis.zcard(['hero_rankings', moment().startOf('quarter').format('X'), hero_id].join(':'), function(err, card)
        {
            if (err)
            {
                return cb(err);
            }
            redis.zrank(['hero_rankings', moment().startOf('quarter').format('X'), hero_id].join(':'), account_id, function(err, rank)
            {
                cb(err,
                {
                    hero_id: hero_id,
                    rank: rank,
                    card: card
                });
            });
        });
    }, function(err, result)
    {
        console.timeEnd('[PLAYER] getPlayerRankings ' + account_id);
        cb(err, result);
    });
}

function getPlayer(db, account_id, cb)
{
    if (!Number.isNaN(account_id))
    {
        db.first().from('players').where(
        {
            account_id: Number(account_id)
        }).asCallback(cb);
    }
    else
    {
        cb();
    }
}

function getDistributions(redis, cb)
{
    redis.keys('distribution:*', function(err, results)
    {
        if (err)
        {
            return cb(err);
        }
        var result = {};
        async.each(results, function(r, cb)
        {
            redis.get(r, function(err, blob)
            {
                if (err)
                {
                    return cb(err);
                }
                result[r.split(':')[1]] = JSON.parse(blob);
                cb(err);
            });
        }, function(err)
        {
            return cb(err, result);
        });
    });
}

function getPicks(redis, options, cb)
{
    var length = options.length;
    var limit = options.limit;
    var single_rates = {};
    //look up total
    redis.get('picks_match_count', function(err, total)
    {
        if (err)
        {
            return cb(err);
        }
        //get singles games/wins for composite computation
        async.parallel(
        {
            "picks": function(cb)
            {
                async.map(Object.keys(constants.heroes), function(hero_id, cb)
                {
                    redis.zscore('picks_counts:1', hero_id, cb);
                }, cb);
            },
            "wins": function(cb)
            {
                async.map(Object.keys(constants.heroes), function(hero_id, cb)
                {
                    redis.zscore('picks_wins_counts:1', hero_id, cb);
                }, cb);
            }
        }, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            Object.keys(constants.heroes).forEach(function(hero_id, i)
            {
                single_rates[hero_id] = {
                    pick_rate: Number(result.picks[i]) / total,
                    win_rate: Number(result.wins[i]) / Number(result.picks[i])
                };
            });
            //get top 1000 picks for current length
            redis.zrevrangebyscore('picks_counts:' + length, "inf", "-inf", "WITHSCORES", "LIMIT", "0", limit, function(err, rows)
            {
                if (err)
                {
                    return cb(err);
                }
                var entries = rows.map(function(r, i)
                {
                    return {
                        key: r,
                        games: rows[i + 1]
                    };
                }).filter(function(r, i)
                {
                    return i % 2 === 0;
                });
                //look up wins
                async.each(entries, function(entry, cb)
                {
                    entry.pickrate = entry.games / total;
                    var hids = entry.key.split(',');
                    entry.expected_pick = hids.map(function(hero_id)
                    {
                        return single_rates[hero_id].pick_rate;
                    }).reduce((prev, curr) => prev * curr) / hids.length;
                    entry.expected_win = expectedWin(hids.map(function(hero_id)
                    {
                        return single_rates[hero_id].win_rate;
                    }));
                    redis.zscore('picks_wins_counts:' + length, entry.key, function(err, score)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        entry.wins = Number(score);
                        entry.winrate = entry.wins / entry.games;
                        cb(err);
                    });
                }, function(err)
                {
                    return cb(err,
                    {
                        total: Number(total),
                        n: length,
                        entries: entries
                    });
                });
            });
        });
    });
}

function expectedWin(rates)
{
    //simple implementation, average
    //return rates.reduce((prev, curr) => prev + curr)) / hids.length;
    //advanced implementation, asymptotic
    //https://github.com/yasp-dota/yasp/issues/959
    //return 1 - rates.reduce((prev, curr) => (1 - curr) * prev, 1) / (Math.pow(50, rates.length-1));
    return 1 - rates.reduce((prev, curr) => (100 - curr * 100) * prev, 1) / (Math.pow(50, rates.length - 1) * 100);
}

function getTop(db, redis, cb)
{
    db.raw(`
    SELECT * from notable_players
    `).asCallback(function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        getLeaderboard(db, redis, 'solo_competitive_rank', 500, function(err, result2)
        {
            return cb(err,
            {
                notables: result.rows,
                leaderboard: result2
            });
        });
    });
}

function getHeroRankings(db, redis, hero_id, cb)
{
    getLeaderboard(db, redis, ['hero_rankings', moment().startOf('quarter').format('X'), hero_id].join(':'), 100, function(err, entries)
    {
        if (err)
        {
            return cb(err);
        }
        async.each(entries, function(player, cb)
        {
            async.parallel(
            {
                solo_competitive_rank: function(cb)
                {
                    redis.zscore('solo_competitive_rank', player.account_id, cb);
                },
                wins: function(cb)
                {
                    redis.hget(['wins', moment().startOf('quarter').format('X'), hero_id].join(':'), player.account_id, cb);
                },
                games: function(cb)
                {
                    redis.hget(['games', moment().startOf('quarter').format('X'), hero_id].join(':'), player.account_id, cb);
                },
            }, function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                player.solo_competitive_rank = result.solo_competitive_rank;
                player.wins = result.wins;
                player.games = result.games;
                cb(err);
            });
        }, function(err)
        {
            return cb(err,
            {
                hero_id: Number(hero_id),
                rankings: entries
            });
        });
    });
}

function getBenchmarks(db, redis, options, cb)
{
    var hero_id = options.hero_id;
    var ret = {};
    async.each(Object.keys(benchmarks), function(metric, cb)
    {
        var arr = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];
        async.each(arr, function(percentile, cb)
        {
            var key = ["benchmarks", utility.getStartOfBlockHours(config.BENCHMARK_RETENTION_HOURS, config.NODE_ENV === "development" ? 0 : -1), metric, hero_id].join(':');
            redis.zcard(key, function(err, card)
            {
                if (err)
                {
                    return cb(err);
                }
                var position = ~~(card * percentile);
                redis.zrange(key, position, position, "WITHSCORES", function(err, result)
                {
                    var obj = {
                        percentile: percentile,
                        value: Number(result[1])
                    };
                    if (!ret[metric])
                    {
                        ret[metric] = [];
                    }
                    ret[metric].push(obj);
                    cb(err, obj);
                });
            });
        }, cb);
    }, function(err)
    {
        return cb(err,
        {
            hero_id: Number(hero_id),
            result: ret
        });
    });
}

function getLeaderboard(db, redis, key, n, cb)
{
    redis.zrevrangebyscore(key, "inf", "-inf", "WITHSCORES", "LIMIT", "0", n, function(err, rows)
    {
        if (err)
        {
            return cb(err);
        }
        var entries = rows.map(function(r, i)
        {
            return {
                account_id: r,
                score: rows[i + 1]
            };
        }).filter(function(r, i)
        {
            return i % 2 === 0;
        });
        var account_ids = entries.map(function(r)
        {
            return r.account_id;
        });
        //get player data from DB
        db.select().from('players').whereIn('account_id', account_ids).asCallback(function(err, names)
        {
            if (err)
            {
                return cb(err);
            }
            var obj = {};
            names.forEach(function(n)
            {
                obj[n.account_id] = n;
            });
            entries.forEach(function(e)
            {
                for (var key in obj[e.account_id])
                {
                    e[key] = e[key] || obj[e.account_id][key];
                }
            });
            cb(err, entries);
        });
    });
}

function mmrEstimate(db, redis, account_id, cb)
{
    redis.lrange('mmr_estimates:' + account_id, 0, -1, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        var data = result.filter(function(d)
        {
            //remove invalid values
            return d;
        }).map(function(d)
        {
            //convert to numerical values
            return Number(d);
        });
        cb(err,
        {
            estimate: utility.average(data),
            stdDev: utility.stdDev(data),
            n: data.length
        });
    });
}
/**
 * @param db - databse object
 * @param search - object to for where parameter of query
 * @param cb - callback
 */
function findPlayer(db, search, cb)
{
    db.first(['account_id', 'personaname', 'avatarfull']).from('players').where(search).asCallback(cb);
}

function searchPlayer(db, query, cb)
{
    async.parallel(
    {
        account_id: function(callback)
        {
            if (Number.isNaN(Number(query)))
            {
                return callback();
            }
            else
            {
                findPlayer(db,
                {
                    account_id: Number(query)
                }, callback);
            }
        },
        personaname: function(callback)
        {
            db.raw(`
                    SELECT account_id, personaname, avatarfull, similarity(personaname, ?)
                    FROM players WHERE personaname ILIKE ?
                    ORDER BY similarity DESC LIMIT 100
                    `, [query, "%" + query + "%"]).asCallback(function(err, result)
            {
                if (err)
                {
                    return callback(err);
                }
                return callback(err, result.rows);
            });
        }
    }, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        var ret = [];
        for (var key in result)
        {
            if (result[key])
            {
                ret = ret.concat(result[key]);
            }
        }
        cb(null, ret);
    });
}
module.exports = {
    getSets,
    insertPlayer,
    insertMatch,
    insertPlayerRating,
    insertMatchSkill,
    getMatch,
    getPlayerMatches,
    getPlayerRatings,
    getPlayerRankings,
    getPlayer,
    getDistributions,
    getPicks,
    getTop,
    getHeroRankings,
    upsert,
    getBenchmarks,
    getLeaderboard,
    mmrEstimate,
    searchPlayer
};
