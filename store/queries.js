/**
 * Provides functions to get/insert data into data stores.
 **/
const utility = require('../util/utility');
const benchmarks = require('../util/benchmarks');
const config = require('../config');
const constants = require('dotaconstants');
const queue = require('./queue');
const addToQueue = queue.addToQueue;
const mQueue = queue.getQueue('mmr');
const async = require('async');
const convert64to32 = utility.convert64to32;
const moment = require('moment');
const util = require('util');
const cQueue = queue.getQueue('cache');
const pQueue = queue.getQueue('parse');
const serialize = utility.serialize;
const deserialize = utility.deserialize;
const reduceAggregable = utility.reduceAggregable;
const filter = require('../util/filter');
const compute = require('../util/compute');
const computeMatchData = compute.computeMatchData;
const cassandra = (config.ENABLE_CASSANDRA_MATCH_STORE_READ || config.ENABLE_CASSANDRA_MATCH_STORE_WRITE) ? require('../store/cassandra') : undefined;
const columnInfo = {};
const cassandraColumnInfo = {};

function cleanRow(db, table, row, cb)
{
    if (columnInfo[table])
    {
        return doCleanRow(null, columnInfo[table], row, cb);
    }
    else
    {
        db(table).columnInfo().asCallback(function (err, result)
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
        cassandra.execute(`SELECT column_name FROM system_schema.columns WHERE keyspace_name = 'yasp' AND table_name = ?`, [table], function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            cassandraColumnInfo[table] = {};
            result.rows.forEach(function (r)
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
    cleanRow(db, table, row, function (err, row)
    {
        if (err)
        {
            return cb(err);
        }
        var values = Object.keys(row).map(function (key)
        {
            return '?';
        });
        var update = Object.keys(row).map(function (key)
        {
            return util.format("%s=%s", key, "EXCLUDED." + key);
        });
        var query = util.format("INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET %s", table, Object.keys(row).join(','), values, Object.keys(conflict).join(','), update.join(','));
        //console.log(query.toString());
        db.raw(query, Object.keys(row).map(function (key)
        {
            return row[key];
        })).asCallback(cb);
    });
}

function insertMatch(db, redis, match, options, cb)
{
    var players = match.players ? JSON.parse(JSON.stringify(match.players)) : undefined;
    //don't insert anonymous account id
    players.forEach(function (p)
    {
        if (p.account_id === constants.anonymous_account_id)
        {
            delete p.account_id;
        }
    });
    //if we have a pgroup from earlier, use it to fill out hero_ids (used after parse)
    if (players && match.pgroup)
    {
        players.forEach(function (p)
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
        players.forEach(function (p, i)
        {
            match.pgroup[p.player_slot] = {
                account_id: p.account_id || null,
                hero_id: p.hero_id,
                player_slot: p.player_slot
            };
        });
    }
    //ability_upgrades_arr
    if (players)
    {
        players.forEach(function (p)
        {
            if (p.ability_upgrades)
            {
                p.ability_upgrades_arr = p.ability_upgrades.map(function (au)
                {
                    return au.ability;
                });
            }
        });
    }
    //options.type specify api, parse, or skill
    //we want to insert into matches, then insert into player_matches for each entry in players
    async.series(
    {
        "dlp": decideLogParse,
        "u": upsertMatch,
        "uc": upsertMatchCassandra,
        "upc": updatePlayerCaches,
        "uct": updateCounts,
        "cmc": clearMatchCache,
        "t": telemetry,
        "dm": decideMmr,
        "dpro": decideProfile,
        "dp": decideParse,
    }, function (err, results)
    {
        return cb(err, results.dp);
    });

    function decideLogParse(cb)
    {
        if (match.leagueid && match.human_players === 10)
        {
            redis.sismember('pro_leagueids', match.leagueid, function (err, result)
            {
                options.doLogParse = options.doLogParse || Boolean(Number(result));
                cb(err);
            });
        }
        else
        {
            cb();
        }
    }

    function upsertMatch(cb)
    {
        if (!config.ENABLE_POSTGRES_MATCH_STORE_WRITE && !options.doLogParse)
        {
            return cb();
        }
        db.transaction(function (trx)
        {
            async.series(
            {
                "m": upsertMatch,
                "pm": upsertPlayerMatches,
                "pb": upsertPicksBans,
                "mp": upsertMatchPatch,
                "utm": upsertTeamMatch,
                "l": upsertMatchLogs,
            }, exit);

            function upsertMatch(cb)
            {
                upsert(trx, 'matches', match,
                {
                    match_id: match.match_id
                }, cb);
            }

            function upsertPlayerMatches(cb)
            {
                async.each(players || [], function (pm, cb)
                {
                    pm.match_id = match.match_id;
                    upsert(trx, 'player_matches', pm,
                    {
                        match_id: pm.match_id,
                        player_slot: pm.player_slot
                    }, cb);
                }, cb);
            }

            function upsertPicksBans(cb)
            {
                async.each(match.picks_bans || [], function (p, cb)
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

            function upsertMatchPatch(cb)
            {
                if (match.start_time)
                {
                    upsert(trx, 'match_patch',
                    {
                        match_id: match.match_id,
                        patch: constants.patch[utility.getPatchIndex(match.start_time)].name
                    },
                    {
                        match_id: match.match_id
                    }, cb);
                }
                else
                {
                    return cb();
                }
            }

            function upsertTeamMatch(cb)
            {
                var arr = [];
                if (match.radiant_team_id)
                {
                    arr.push(
                    {
                        team_id: match.radiant_team_id,
                        match_id: match.match_id,
                        radiant: true
                    });
                }
                if (match.dire_team_id)
                {
                    arr.push(
                    {
                        team_id: match.dire_team_id,
                        match_id: match.match_id,
                        radiant: false
                    });
                }
                async.each(arr, function (tm, cb)
                {
                    upsert(trx, 'team_match', tm,
                    {
                        team_id: tm.team_id,
                        match_id: tm.match_id
                    }, cb);
                }, cb);
            }

            function upsertMatchLogs(cb)
            {
                if (!match.logs)
                {
                    return cb();
                }
                else
                {
                    trx.raw(`DELETE FROM match_logs WHERE match_id = ?`, [match.match_id]).asCallback(function (err)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        async.eachLimit(match.logs, 10000, function (e, cb)
                        {
                            trx('match_logs').insert(e).asCallback(cb);
                        }, cb);
                    });
                }
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
        cleanRowCassandra(cassandra, 'matches', match, function (err, match)
        {
            if (err)
            {
                return cb(err);
            }
            var obj = serialize(match);
            if (!Object.keys(obj).length)
            {
                return cb(err);
            }
            var query = util.format('INSERT INTO matches (%s) VALUES (%s)', Object.keys(obj).join(','), Object.keys(obj).map(function (k)
            {
                return '?';
            }).join(','));
            var arr = Object.keys(obj).map(function (k)
            {
                // boolean types need to be expressed as booleans, if strings the cassandra driver will always convert it to true, e.g. 'false'
                return (obj[k] === "true" || obj[k] === "false") ? JSON.parse(obj[k]) : obj[k];
            });
            cassandra.execute(query, arr,
            {
                prepare: true,
            }, function (err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                async.each(players || [], function (pm, cb)
                {
                    pm.match_id = match.match_id;
                    cleanRowCassandra(cassandra, 'player_matches', pm, function (err, pm)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        var obj2 = serialize(pm);
                        if (!Object.keys(obj2).length)
                        {
                            return cb(err);
                        }
                        var query2 = util.format('INSERT INTO player_matches (%s) VALUES (%s)', Object.keys(obj2).join(','), Object.keys(obj2).map(function (k)
                        {
                            return '?';
                        }).join(','));
                        var arr2 = Object.keys(obj2).map(function (k)
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

    function updatePlayerCaches(cb)
    {
        if (!config.ENABLE_CASSANDRA_MATCH_STORE_WRITE)
        {
            return cb();
        }
        var copy = createMatchCopy(match, players, options);
        insertPlayerCache(copy, cb);
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
        if (options.origin === 'scanner')
        {
            redis.zadd("added_match", moment().format('X'), match.match_id);
        }
        return cb();
    }

    function clearMatchCache(cb)
    {
        redis.del("match:" + match.match_id, cb);
    }

    function decideMmr(cb)
    {
        async.each(match.players, function (p, cb)
        {
            if (options.origin === "scanner" && match.lobby_type === 7 && p.account_id && p.account_id !== constants.anonymous_account_id && config.ENABLE_RANDOM_MMR_UPDATE)
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
        async.each(match.players, function (p, cb)
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
        if (options.skipParse)
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
                doLogParse: options.doLogParse,
            },
            {
                lifo: options.lifo,
                attempts: options.attempts,
                backoff: options.backoff,
            }, function (err, job2)
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

function insertPlayerCache(match, cb)
{
    if (cassandra)
    {
        var players = match.players;
        if (match.pgroup && players)
        {
            players.forEach(function (p)
            {
                if (match.pgroup[p.player_slot])
                {
                    //add account id to each player so we know what caches to update
                    p.account_id = match.pgroup[p.player_slot].account_id;
                    //add hero_id to each player so we update records with hero played
                    p.hero_id = match.pgroup[p.player_slot].hero_id;
                }
            });
        }
        async.eachSeries(players, function (player_match, cb)
        {
            if (player_match.account_id && player_match.account_id !== constants.anonymous_account_id)
            {
                //join player with match to form player_match
                for (var key in match)
                {
                    if (key !== 'players')
                    {
                        player_match[key] = match[key];
                    }
                }
                computeMatchData(player_match);
                writeCache(player_match.account_id,
                {
                    raw: [player_match]
                }, cb);
            }
            else
            {
                return cb();
            }
        }, cb);
    }
    else
    {
        return cb();
    }

    function writeCache(account_id, cache, cb)
    {
        if (cassandra)
        {
            //console.log("saving player cache to cassandra %s", account_id);
            //upsert matches into store
            return async.each(cache.raw, function (m, cb)
            {
                m = serialize(reduceAggregable(m));
                var query = util.format('INSERT INTO player_caches (%s) VALUES (%s)', Object.keys(m).join(','), Object.keys(m).map(function (k)
                {
                    return '?';
                }).join(','));
                cassandra.execute(query, Object.keys(m).map(function (k)
                {
                    return m[k];
                }),
                {
                    prepare: true
                }, cb);
            }, function (err)
            {
                if (err)
                {
                    console.error(err.stack);
                }
                return cb(err);
            });
        }
        else
        {
            return cb();
        }
    }
}

function getSets(redis, cb)
{
    async.parallel(
    {
        "trackedPlayers": function (cb)
        {
            redis.zrange('tracked', 0, -1, function (err, ids)
            {
                if (err)
                {
                    return cb(err);
                }
                var result = {};
                ids.forEach(function (id)
                {
                    result[id] = 1;
                });
                return cb(err, result);
            });
        },
    }, cb);
}
/**
 * Benchmarks a match against stored data in Redis.
 **/
function getMatchBenchmarks(redis, m, cb)
{
    async.map(m.players, function (p, cb)
    {
        p.benchmarks = {};
        async.eachSeries(Object.keys(benchmarks), function (metric, cb)
        {
            // Use data from previous epoch
            var key = ['benchmarks', utility.getStartOfBlockMinutes(config.BENCHMARK_RETENTION_MINUTES, -1), metric, p.hero_id].join(':');
            var raw = benchmarks[metric](m, p);
            p.benchmarks[metric] = {
                raw: raw
            };
            redis.zcard(key, function (err, card)
            {
                if (err)
                {
                    return cb(err);
                }
                if (raw !== undefined && raw !== null && !Number.isNaN(raw))
                {
                    redis.zcount(key, '0', raw, function (err, count)
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
    async.map(match.players, function (player, cb)
    {
        if (!player.account_id)
        {
            return cb();
        }
        redis.zscore('solo_competitive_rank', player.account_id, cb);
    }, function (err, result)
    {
        if (err)
        {
            return cb(err);
        }
        // Remove undefined/null values
        var filt = result.filter(function (r)
        {
            return r;
        });
        var avg = ~~(filt.map(function (r)
        {
            return Number(r);
        }).reduce(function (a, b)
        {
            return a + b;
        }, 0) / filt.length);
        cb(err, avg, filt.length);
    });
}

function getDistributions(redis, cb)
{
    var keys = ["distribution:mmr", "distribution:country_mmr"];
    var result = {};
    async.each(keys, function (r, cb)
    {
        redis.get(r, function (err, blob)
        {
            if (err)
            {
                return cb(err);
            }
            result[r.split(':')[1]] = JSON.parse(blob);
            cb(err);
        });
    }, function (err)
    {
        return cb(err, result);
    });
}

function getProPlayers(db, redis, cb)
{
    db.raw(`
    SELECT * from notable_players
    `).asCallback(function (err, result)
    {
        if (err)
        {
            return cb(err);
        }
        return cb(err, result.rows);
    });
}

function getHeroRankings(db, redis, hero_id, options, cb)
{
    getLeaderboard(db, redis, [options.beta ? 'hero_rankings2' : 'hero_rankings', moment().startOf('quarter').format('X'), hero_id].join(':'), 100, function (err, entries)
    {
        if (err)
        {
            return cb(err);
        }
        async.each(entries, function (player, cb)
        {
            async.parallel(
            {
                solo_competitive_rank: function (cb)
                {
                    redis.zscore('solo_competitive_rank', player.account_id, cb);
                },
            }, function (err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                player.solo_competitive_rank = result.solo_competitive_rank;
                cb(err);
            });
        }, function (err)
        {
            return cb(err,
            {
                hero_id: Number(hero_id),
                rankings: entries
            });
        });
    });
}

function getHeroBenchmarks(db, redis, options, cb)
{
    var hero_id = options.hero_id;
    var ret = {};
    async.each(Object.keys(benchmarks), function (metric, cb)
    {
        var arr = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];
        async.each(arr, function (percentile, cb)
        {
            // Use data from previous epoch
            var key = ["benchmarks", utility.getStartOfBlockMinutes(config.BENCHMARK_RETENTION_MINUTES, -1), metric, hero_id].join(':');
            redis.zcard(key, function (err, card)
            {
                if (err)
                {
                    return cb(err);
                }
                var position = ~~(card * percentile);
                redis.zrange(key, position, position, "WITHSCORES", function (err, result)
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
    }, function (err)
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
    redis.zrevrangebyscore(key, "inf", "-inf", "WITHSCORES", "LIMIT", "0", n, function (err, rows)
    {
        if (err)
        {
            return cb(err);
        }
        var entries = rows.map(function (r, i)
        {
            return {
                account_id: r,
                score: rows[i + 1]
            };
        }).filter(function (r, i)
        {
            return i % 2 === 0;
        });
        var account_ids = entries.map(function (r)
        {
            return r.account_id;
        });
        //get player data from DB
        db.select().from('players').whereIn('account_id', account_ids).asCallback(function (err, names)
        {
            if (err)
            {
                return cb(err);
            }
            var obj = {};
            names.forEach(function (n)
            {
                obj[n.account_id] = n;
            });
            entries.forEach(function (e)
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

function getMmrEstimate(db, redis, account_id, cb)
{
    redis.lrange('mmr_estimates:' + account_id, 0, -1, function (err, result)
    {
        if (err)
        {
            return cb(err);
        }
        var data = result.filter(function (d)
        {
            //remove invalid values
            return d;
        }).map(function (d)
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

function getMatchesSkill(db, matches, options, cb)
{
    //fill in skill data from table (only necessary if reading from cache since adding skill data doesn't update cache)
    console.time('[PLAYER] fillSkill');
    //get skill data for matches within cache expiry (might not have skill data)
    /*
    var recents = matches.filter(function(m)
    {
        return moment().diff(moment.unix(m.start_time), 'days') <= config.UNTRACK_DAYS;
    });
    */
    //just get skill for last N matches (faster)
    var recents = matches.slice(0, 20);
    var skillMap = {};
    db.select(['match_id', 'skill']).from('match_skill').whereIn('match_id', recents.map(function (m)
    {
        return m.match_id;
    })).asCallback(function (err, rows)
    {
        if (err)
        {
            return cb(err);
        }
        console.log("fillSkill recents: %s, results: %s", recents.length, rows.length);
        rows.forEach(function (match)
        {
            skillMap[match.match_id] = match.skill;
        });
        matches.forEach(function (m)
        {
            m.skill = m.skill || skillMap[m.match_id];
        });
        console.timeEnd('[PLAYER] fillSkill');
        return cb(err, matches);
    });
}

function getPlayerMatches(account_id, queryObj, cb)
{
    if (config.ENABLE_CASSANDRA_MATCH_STORE_READ && cassandra)
    {
        var query = util.format('SELECT %s FROM player_caches WHERE account_id = ? ORDER BY match_id DESC', queryObj.project.join(','));
        var matches = [];
        return cassandra.stream(query, [account_id],
        {
            prepare: true,
            fetchSize: 1000,
            autoPage: true,
        }).on('readable', function ()
        {
            //readable is emitted as soon a row is received and parsed
            var m;
            while (m = this.read())
            {
                m = deserialize(m);
                if (filter([m], queryObj.filter).length)
                {
                    matches.push(m);
                }
            }
        }).on('end', function (err)
        {
            //stream ended, there aren't any more rows
            if (queryObj.sort)
            {
                matches.sort(function (a, b)
                {
                    return b[queryObj.sort] - a[queryObj.sort];
                });
            }
            matches = matches.slice(queryObj.offset, queryObj.limit || matches.length);
            return cb(err, matches);
        }).on('error', function (err)
        {
            throw err;
        });
    }
    else
    {
        //TODO support reading from postgres
        return cb(null, []);
    }
}

function getPlayerRatings(db, account_id, cb)
{
    console.time('[PLAYER] getPlayerRatings ' + account_id);
    if (!Number.isNaN(account_id))
    {
        db.from('player_ratings').where(
        {
            account_id: Number(account_id)
        }).orderBy('time', 'asc').asCallback(function (err, result)
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
    async.map(Object.keys(constants.heroes), function (hero_id, cb)
    {
        redis.zcard(['hero_rankings', moment().startOf('quarter').format('X'), hero_id].join(':'), function (err, card)
        {
            if (err)
            {
                return cb(err);
            }
            redis.zrank(['hero_rankings', moment().startOf('quarter').format('X'), hero_id].join(':'), account_id, function (err, rank)
            {
                cb(err,
                {
                    hero_id: hero_id,
                    rank: rank,
                    card: card
                });
            });
        });
    }, function (err, result)
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

function getPeers(db, input, player, cb)
{
    if (!input)
    {
        return cb();
    }
    var teammates_arr = [];
    var teammates = input;
    for (var id in teammates)
    {
        var tm = teammates[id];
        id = Number(id);
        //don't include if anonymous, self or if few games together
        if (id && id !== Number(player.account_id) && id !== constants.anonymous_account_id && (tm.games >= 5))
        {
            teammates_arr.push(tm);
        }
    }
    teammates_arr.sort(function (a, b)
    {
        return b.games - a.games;
    });
    //limit to 200 max players
    teammates_arr = teammates_arr.slice(0, 200);
    async.each(teammates_arr, function (t, cb)
    {
        db.first().from('players').where(
        {
            account_id: t.account_id
        }).asCallback(function (err, row)
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
    }, function (err)
    {
        cb(err, teammates_arr);
    });
}

function getProPeers(db, input, player, cb)
{
    if (!input)
    {
        return cb();
    }
    var teammates = input;
    db.select().from('notable_players').asCallback(function (err, result)
    {
        var arr = result.map(function (r)
        {
            return Object.assign(
            {}, r, teammates[r.account_id]);
        }).filter(function (r)
        {
            return r.games;
        }).sort(function (a, b)
        {
            return b.games - a.games;
        });
        cb(err, arr);
    });
}
module.exports = {
    upsert,
    insertPlayer,
    insertMatch,
    insertPlayerRating,
    insertMatchSkill,
    getSets,
    getDistributions,
    getProPlayers,
    getHeroRankings,
    getHeroBenchmarks,
    getMatchBenchmarks,
    getMatchRating,
    getLeaderboard,
    getPlayerMatches,
    getPlayerRatings,
    getPlayerRankings,
    getPlayer,
    getMmrEstimate,
    getMatchesSkill,
    getPeers,
    getProPeers,
};
