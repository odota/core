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
var aggregator = require('./aggregator');
var constants = require('./constants');
var benchmarks = require('./benchmarks');
var filter = require('./filter');
var util = require('util');
var queue = require('./queue');
var cQueue = queue.getQueue('cache');
var pQueue = queue.getQueue('parse');
var serialize = utility.serialize;
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
        //TODO clean based on cassandra schema
        //SELECT column_name FROM system_schema.columns WHERE keyspace_name = 'yasp' AND table_name = 'player_matches'
        //insert into matches
        //insert into player matches
        //current dependencies on matches/player_matches in db
        //getReplayUrl, check and save replay url: store salts/urls in separate collection?
        //fullhistory, diff a user's current matches from the set obtained from webapi
        //cacher, get source-of-truth counts/wins for a hero for rankings
        //distributions (queries on gamemode/lobbytype/skill)
        //status (recent added/parsed, counts)
        //query for match (joins)
        //query for player (joins)
        //mmr estimator
        var obj = serialize(match);
        var query = util.format('INSERT INTO matches (%s) VALUES (%s)', Object.keys(obj).join(','), Object.keys(obj).map(function(k)
        {
            return '?';
        }).join(','));
        cassandra.execute(query, Object.keys(obj).map(function(k)
        {
            return obj[k];
        }),
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
                pm.match_id = match.match_id;
                var obj2 = serialize(pm);
                var query2 = util.format('INSERT INTO player_matches (%s) VALUES (%s)', Object.keys(obj2).join(','), Object.keys(obj2).map(function(k)
                {
                    return '?';
                }).join(','));
                cassandra.execute(query2, Object.keys(obj2).map(function(k)
                {
                    return obj2[k];
                }),
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
        queue.addToQueue(cQueue, copy,
        {
            attempts: 1
        }, cb);
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

function getMatch(db, redis, match_id, cb)
{
    db.first().from('matches').where(
    {
        match_id: Number(match_id)
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
            //join to get personaname, last_login, avatar
            db.select().from('player_matches').where(
            {
                "player_matches.match_id": Number(match_id)
            }).leftJoin('players', 'player_matches.account_id', 'players.account_id').innerJoin('matches', 'player_matches.match_id', 'matches.match_id').orderBy("player_slot", "asc").asCallback(function(err, players)
            {
                if (err)
                {
                    return cb(err);
                }
                //get ability upgrades data
                redis.get('ability_upgrades:' + match_id, function(err, ab_upgrades)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    ab_upgrades = JSON.parse(ab_upgrades);
                    players.forEach(function(p)
                    {
                        computePlayerMatchData(p);
                        if (ab_upgrades)
                        {
                            p.ability_upgrades_arr = ab_upgrades[p.player_slot];
                        }
                    });
                    match.players = players;
                    computeMatchData(match);
                    renderMatch(match);
                    benchmarkMatch(redis, match, function(err)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        if (match.players)
                        {
                            //remove some duplicated columns from match.players to reduce size
                            //we don't need them anymore since we already the computations
                            match.players.forEach(function(p)
                            {
                                delete p.chat;
                                delete p.objectives;
                                delete p.teamfights;
                            });
                        }
                        return cb(err, match);
                    });
                });
            });
        }
    });
}

function getPlayerMatches(db, queryObj, cb)
{
    var result = {
        aggData: aggregator([], queryObj.js_agg),
        raw: []
    };
    var stream = db.select(queryObj.project).from('player_matches').where(queryObj.db_select).limit(queryObj.limit).orderBy('player_matches.match_id', 'desc').innerJoin('matches', 'player_matches.match_id', 'matches.match_id').leftJoin('match_skill', 'player_matches.match_id', 'match_skill.match_id').stream();
    stream.on('end', function(err)
    {
        cb(err, result);
    });
    stream.on('error', cb);
    stream.on('data', function(m)
    {
        computePlayerMatchData(m);
        if (filter([m], queryObj.js_select).length)
        {
            result.aggData = aggregator([m], queryObj.js_agg, result.aggData);
            result.raw.push(m);
        }
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
                    entry.expected_win = hids.map(function(hero_id)
                    {
                        return single_rates[hero_id].win_rate;
                    }).reduce((prev, curr) => prev + curr) / hids.length;
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
    getLeaderboard(db, redis, 'hero_rankings:' + hero_id, 250, function(err, entries)
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
                    redis.hget('wins:' + player.account_id, hero_id, cb);
                },
                games: function(cb)
                {
                    redis.hget('games:' + player.account_id, hero_id, cb);
                }
            }, function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                player.solo_competitive_rank = result.solo_competitive_rank;
                player.games = result.games;
                player.wins = result.wins;
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
        var arr = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];
        async.each(arr, function(percentile, cb)
        {
            var key = ["benchmarks", moment().subtract(config.NODE_ENV === "development" ? 0 : 1, 'hour').startOf('hour').format('X'), metric, hero_id].join(':');
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

function updateScore(redis, player, cb)
{
    if (player.incr)
    {
        var win = Number(utility.isRadiant(player) === player.radiant_win);
        //TODO possible inconsistency if we exit/crash after this incr but before completion
        redis.hincrby('wins:' + player.account_id, player.hero_id, win);
        redis.hincrby('games:' + player.account_id, player.hero_id, 1);
        player.wins += win;
        player.games += 1;
    }
    else
    {
        redis.hset('wins:' + player.account_id, player.hero_id, player.wins);
        redis.hset('games:' + player.account_id, player.hero_id, player.games);
    }
    var scaleF = 0.00001;
    var winRatio = (player.wins / (player.games - player.wins + 1));
    var mmrBonus = Math.pow(player.solo_competitive_rank, 2);
    redis.zadd('hero_rankings:' + player.hero_id, scaleF * player.games * winRatio * mmrBonus, player.account_id);
    console.log("ranked %s, %s", player.account_id, player.hero_id);
    cb();
}
module.exports = {
    getSets: getSets,
    insertPlayer: insertPlayer,
    insertMatch: insertMatch,
    insertPlayerRating: insertPlayerRating,
    insertMatchSkill: insertMatchSkill,
    getMatch: getMatch,
    getPlayerMatches: getPlayerMatches,
    getPlayerRatings: getPlayerRatings,
    getPlayerRankings: getPlayerRankings,
    getPlayer: getPlayer,
    getDistributions: getDistributions,
    getPicks: getPicks,
    getTop: getTop,
    getHeroRankings: getHeroRankings,
    upsert: upsert,
    getBenchmarks: getBenchmarks,
    getLeaderboard: getLeaderboard,
    updateScore: updateScore,
};
