/**
 * Provides functions to get/insert data into data stores.
 **/
var utility = require('../util/utility');
var benchmarks = require('../util/benchmarks');
var config = require('../config');
var constants = require('../constants');
var queue = require('./queue');
var playerCache = require('./playerCache');
var addToQueue = queue.addToQueue;
var mQueue = queue.getQueue('mmr');
var async = require('async');
var convert64to32 = utility.convert64to32;
var moment = require('moment');
var util = require('util');
var cQueue = queue.getQueue('cache');
var pQueue = queue.getQueue('parse');
var updateCache = playerCache.updateCache;
var serialize = utility.serialize;
var deserialize = utility.deserialize;
var columnInfo = {};
var cassandraColumnInfo = {};

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

function cleanRow(db, table, row, cb)
{
    if (columnInfo[table])
    {
        return doCleanRow(null, columnInfo[table], row, cb);
    }
    else
    {
        db(table).columnInfo().asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            columnInfo[table] = result;
            return doCleanRow(err, columnInfo[table], row, cb);
        });
    }
}

function cleanRowCassandra(cassandra, table, row, cb)
{
    if (cassandraColumnInfo[table])
    {
        return doCleanRow(null, cassandraColumnInfo[table], row, cb);
    }
    else
    {
        cassandra.execute(`SELECT column_name FROM system_schema.columns WHERE keyspace_name = 'yasp' AND table_name = ?`, [table], function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            cassandraColumnInfo[table] = {};
            result.rows.forEach(function(r)
            {
                cassandraColumnInfo[table][r.column_name] = 1;
            });
            return doCleanRow(err, cassandraColumnInfo[table], row, cb);
        });
    }
}

function doCleanRow(err, schema, row, cb)
{
    if (err)
    {
        return cb(err);
    }
    var obj = Object.assign(
    {}, row);
    for (var key in obj)
    {
        if (!(key in schema))
        {
            delete obj[key];
        }
    }
    return cb(err, obj);
}

function upsert(db, table, row, conflict, cb)
{
    cleanRow(db, table, row, function(err, row)
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
    //if we have a pgroup from earlier, use it to fill out hero_ids (used after parse)
    if (players && match.pgroup)
    {
        players.forEach(function(p)
        {
            if (match.pgroup[p.player_slot])
            {
                p.hero_id = match.pgroup[p.player_slot].hero_id;
            }
        });
    }
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
        redis.setex("ability_upgrades:" + match.match_id, 60 * 60 * config.ABILITY_UPGRADE_RETENTION_HOURS, JSON.stringify(ability_upgrades));
    }
    //options.type specify api, parse, or skill
    //we want to insert into matches, then insert into player_matches for each entry in players
    async.series(
    {
        "ipm": isProMatch,
        "u": upsertMatch,
        "uc": upsertMatchCassandra,
        "uml": upsertMatchLogs,
        "upc": updatePlayerCaches,
        "uct": updateCounts,
        "cmc": clearMatchCache,
        "t": telemetry,
        "dm": decideMmr,
        "dpro": decideProfile,
        "dp": decideParse,
    }, function(err, results)
    {
        return cb(err, results.dp);
    });

    function isProMatch(cb)
    {
        redis.sismember('pro_leagueids', match.league_id, function(err, result)
        {
            match.isProMatch = Boolean(Number(result));
            cb(err);
        });
    }

    function upsertMatch(cb)
    {
        if (!config.ENABLE_POSTGRES_MATCH_STORE_WRITE && !match.isProMatch)
        {
            return cb();
        }
        db.transaction(function(trx)
        {
            async.series(
            {
                "im": insertMatch,
                "ipm": insertPlayerMatches,
                "ipb": insertPicksBans
            }, exit);

            function insertMatch(cb)
            {
                upsert(trx, 'matches', match,
                {
                    match_id: match.match_id
                }, cb);
            }

            function insertPlayerMatches(cb)
            {
                async.each(players || [], function(pm, cb)
                {
                    pm.match_id = match.match_id;
                    upsert(trx, 'player_matches', pm,
                    {
                        match_id: pm.match_id,
                        player_slot: pm.player_slot
                    }, cb);
                }, cb);
            }

            function insertPicksBans(cb)
            {
                async.each(match.picks_bans || [], function(p, cb)
                {
                    //order is a reserved keyword
                    p.ord = p.order;
                    p.match_id = match.match_id;
                    upsert(trx, 'picks_bans', p,
                    {
                        match_id: p.match_id,
                        ord: p.ord
                    }, cb);
                }, cb);
            }

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
    }

    function upsertMatchCassandra(cb)
    {
        if (!config.ENABLE_CASSANDRA_MATCH_STORE_WRITE)
        {
            return cb();
        }
        var cassandra = options.cassandra;
        //console.log('[INSERTMATCH] upserting into Cassandra');
        cleanRowCassandra(cassandra, 'matches', match, function(err, match)
        {
            if (err)
            {
                return cb(err);
            }
            var obj = serialize(match);
            var query = util.format('INSERT INTO matches (%s) VALUES (%s)', Object.keys(obj).join(','), Object.keys(obj).map(function(k)
            {
                return '?';
            }).join(','));
            var arr = Object.keys(obj).map(function(k)
            {
                // boolean types need to be expressed as booleans, if strings the cassandra driver will always convert it to true, e.g. 'false'
                return (obj[k] === "true" || obj[k] === "false") ? JSON.parse(obj[k]) : obj[k];
            });
            cassandra.execute(query, arr,
            {
                prepare: true,
            }, function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                async.each(players || [], function(pm, cb)
                {
                    pm.match_id = match.match_id;
                    cleanRowCassandra(cassandra, 'player_matches', pm, function(err, pm)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        var obj2 = serialize(pm);
                        var query2 = util.format('INSERT INTO player_matches (%s) VALUES (%s)', Object.keys(obj2).join(','), Object.keys(obj2).map(function(k)
                        {
                            return '?';
                        }).join(','));
                        var arr2 = Object.keys(obj2).map(function(k)
                        {
                            return obj2[k];
                        });
                        cassandra.execute(query2, arr2,
                        {
                            prepare: true
                        }, cb);
                    });
                }, cb);
            });
        });
    }

    function upsertMatchLogs(cb)
    {
        if (!match.logs)
        {
            return cb();
        }
        else
        {
            db.transaction(function(trx)
            {
                trx.raw(`DELETE FROM match_logs where match_id = ?`, [match.match_id]).asCallback(function(err)
                {
                    if (err)
                    {
                        return exit(err);
                    }
                    async.eachLimit(match.logs, 10000, function(e, cb)
                    {
                        trx('match_logs').insert(e).asCallback(cb);
                    }, exit);
                });

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
        }
    }

    function updatePlayerCaches(cb)
    {
        var copy = createMatchCopy(match, players, options);
        updateCache(copy, cb);
    }

    function updateCounts(cb)
    {
        if (options.skipCounts)
        {
            return cb();
        }
        var copy = createMatchCopy(match, players, options);
        //add to queue for counts
        queue.addToQueue(cQueue, copy,
        {
            attempts: 1
        }, cb);
    }

    function telemetry(cb)
    {
        //console.log('[INSERTMATCH] updating telemetry');
        var types = {
            "api": 'matches_last_added',
            "parsed": 'matches_last_parsed'
        };
        if (types[options.type])
        {
            redis.lpush(types[options.type], JSON.stringify(
            {
                match_id: match.match_id,
                duration: match.duration,
                start_time: match.start_time,
            }));
            redis.ltrim(types[options.type], 0, 9);
        }
        if (options.type === "parsed")
        {
            redis.zadd("parser", moment().format('X'), match.match_id);
        }
        return cb();
    }

    function clearMatchCache(cb)
    {
        redis.del("match:" + match.match_id, cb);
    }

    function decideMmr(cb)
    {
        async.each(match.players, function(p, cb)
        {
            if (options.origin === "scanner" && match.lobby_type === 7 && p.account_id && p.account_id !== constants.anonymous_account_id && (p.account_id in options.userPlayers || (config.ENABLE_RANDOM_MMR_UPDATE && match.match_id % 3 === 0)))
            {
                addToQueue(mQueue,
                {
                    match_id: match.match_id,
                    account_id: p.account_id
                },
                {
                    attempts: 1,
                    delay: 180000,
                }, cb);
            }
            else
            {
                cb();
            }
        }, cb);
    }

    function decideProfile(cb)
    {
        async.each(match.players, function(p, cb)
        {
            if (options.origin === "scanner" && p.account_id && p.account_id !== constants.anonymous_account_id)
            {
                redis.lpush('profilerQueue', p.account_id);
                redis.ltrim('profilerQueue', 0, 99);
            }
            cb();
        }, cb);
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
            return queue.addToQueue(pQueue,
            {
                match_id: match.match_id,
                radiant_win: match.radiant_win,
                start_time: match.start_time,
                duration: match.duration,
                replay_blob_key: match.replay_blob_key,
                pgroup: match.pgroup,
                isProMatch: match.isProMatch,
            },
            {
                lifo: options.lifo,
                attempts: options.attempts,
                backoff: options.backoff,
            }, function(err, job2)
            {
                cb(err, job2);
            });
        }
    }
}

function createMatchCopy(match, players, options)
{
    var copy = JSON.parse(JSON.stringify(match));
    copy.players = JSON.parse(JSON.stringify(players));
    copy.insert_type = options.type;
    copy.origin = options.origin;
    return copy;
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
/**
 * Benchmarks a match against stored data in Redis.
 **/
function benchmarkMatch(redis, m, cb)
{
    async.map(m.players, function(p, cb)
    {
        p.benchmarks = {};
        async.eachSeries(Object.keys(benchmarks), function(metric, cb)
        {
            //in development use live data (for speed), in production use full data from last day (for consistency)
            var key = ['benchmarks', utility.getStartOfBlockHours(config.BENCHMARK_RETENTION_HOURS, config.NODE_ENV === "development" ? 0 : -1), metric, p.hero_id].join(':');
            var raw = benchmarks[metric](m, p);
            p.benchmarks[metric] = {
                raw: raw
            };
            redis.zcard(key, function(err, card)
            {
                if (err)
                {
                    return cb(err);
                }
                if (raw !== undefined && raw !== null && !Number.isNaN(raw))
                {
                    redis.zcount(key, '0', raw, function(err, count)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        var pct = count / card;
                        p.benchmarks[metric].pct = pct;
                        return cb(err);
                    });
                }
                else
                {
                    p.benchmarks[metric] = {};
                    cb();
                }
            });
        }, cb);
    }, cb);
}

function getMatchRating(redis, match, cb)
{
    async.map(match.players, function(player, cb)
    {
        if (!player.account_id)
        {
            return cb();
        }
        redis.zscore('solo_competitive_rank', player.account_id, cb);
    }, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        var filt = result.filter(function(r)
        {
            return r;
        });
        var avg = ~~(filt.map(function(r)
        {
            return Number(r);
        }).reduce(function(a, b)
        {
            return a + b;
        }, 0) / filt.length);
        cb(err, avg);
    });
}

function getDistributions(redis, cb)
{
    var keys = ["distribution:mmr", "distribution:country_mmr"];
    var result = {};
    async.each(keys, function(r, cb)
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

function getHeroRankings(db, redis, hero_id, options, cb)
{
    getLeaderboard(db, redis, [options.beta ? 'hero_rankings2' : 'hero_rankings', moment().startOf('quarter').format('X'), hero_id].join(':'), 100, function(err, entries)
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
            }, function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                player.solo_competitive_rank = result.solo_competitive_rank;
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
                    SELECT * FROM
                    (SELECT account_id, personaname, avatarfull, similarity(personaname, ?)
                    FROM players WHERE personaname ILIKE ? LIMIT 1000) search
                    ORDER BY similarity DESC LIMIT 200
                    `, [query, '%' + query + '%']).asCallback(function(err, result)
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
    getDistributions,
    getPicks,
    getTop,
    getHeroRankings,
    getBenchmarks,
    benchmarkMatch,
    getMatchRating,
    upsert,
    getLeaderboard,
    mmrEstimate,
    searchPlayer,
};
