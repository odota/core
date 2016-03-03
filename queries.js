var async = require('async');
var utility = require('./utility');
var convert64to32 = utility.convert64to32;
var compute = require('./compute');
var computePlayerMatchData = compute.computePlayerMatchData;
var computeMatchData = compute.computeMatchData;
var aggregator = require('./aggregator');
var constants = require('./constants');
var filter = require('./filter');
var util = require('util');
var queue = require('./queue');
var cQueue = queue.getQueue('cache');
var pQueue = queue.getQueue('parse');
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
        var query1 = db(table).insert(row);
        var query2 = db(table).update(row).where(conflict);
        query1.asCallback(function(err)
        {
            if (err && err.detail && err.detail.indexOf("already exists") !== -1)
            {
                query2.asCallback(cb);
            }
            else
            {
                cb(err);
            }
        });
        /*
        var values = Object.keys(row).map(function(key)
        {
            return genValue(row, key);
        }).join(',');
        var update = Object.keys(row).map(function(key)
        {
            return util.format("%s=%s", key, "EXCLUDED." + key);
        }).join(',');
        var query = util.format("insert into %s(%s) VALUES (%s) on conflict(%s) do update set %s", table, Object.keys(row), values, Object.keys(conflict).join(','), update);
        require('fs').writeFileSync('output.json', query);
        db.raw(query).asCallback(cb);
        */
    });
}

function genValue(row, key)
{
    if (row[key] && row[key].constructor === Array)
    {
        return util.format("'{%s}'", row[key].map(function(e)
        {
            return JSON.stringify(JSON.stringify(e));
        }).join(','));
    }
    else if (row[key] && typeof(row[key]) === "object")
    {
        return util.format("'%s'", JSON.stringify(row[key]));
    }
    else if (typeof(row[key]) === "string")
    {
        return util.format("'%s'", row[key]);
    }
    else if (row[key] === null)
    {
        return "NULL";
    }
    else
    {
        return row[key];
    }
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
        "clean": clean,
        "i": insert,
        "pc": updatePlayerCaches,
        "cmc": clearMatchCache,
        "dp": decideParse
    }, function(err, results)
    {
        return cb(err, results.dp);
    });

    function clean(cb)
    {
        cleanRow(db, 'matches', match, function(err)
        {
            if (err)
            {
                return cb(err);
            }
            async.each(players || [], function(pm, cb)
            {
                cleanRow(db, 'player_matches', pm, cb);
            }, cb);
        });
    }

    function insert(cb)
    {
        db.transaction(function(trx)
        {
            trx('matches').insert(match).asCallback(function(err)
            {
                if (err)
                {
                    return exit(err);
                }
                async.each(players || [], function(pm, cb)
                {
                    pm.match_id = match.match_id;
                    trx('player_matches').insert(pm).asCallback(cb);
                }, exit);
            });

            function exit(err)
            {
                if (err)
                {
                    trx.rollback(err);
                }
                else
                {
                    trx.commit();
                }
                if (err && err.detail && err.detail.indexOf("already exists") !== -1)
                {
                    update(cb);
                }
                else
                {
                    cb(err);
                }
            }
        });
    }

    function update(cb)
    {
        db.transaction(function(trx)
        {
            trx('matches').update(match).where(
            {
                match_id: match.match_id
            }).asCallback(function(err)
            {
                if (err)
                {
                    return exit(err);
                }
                async.each(players || [], function(pm, cb)
                {
                    pm.match_id = match.match_id;
                    trx('player_matches').update(pm).where(
                    {
                        match_id: pm.match_id,
                        player_slot: pm.player_slot
                    }).asCallback(cb);
                }, exit);
            });

            function exit(err)
            {
                if (err)
                {
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

    function insertCassandra(cb)
    {
        var cassandra = options.cassandra;
        //TODO clean based on cassandra schema
        //SELECT column_name FROM system_schema.columns WHERE keyspace_name = 'yasp' AND table_name = 'player_caches'
        //insert into matches
        //insert into player matches
        //current dependencies on matches/player_matches in db
        //parser, check and save replay url: store salts/urls in separate collection?
        //fullhistory, diff a user's current matches from the set obtained from webapi
        //ranker, get source-of-truth counts/wins for a hero
        //distributions (queries on gamemode/lobbytype/skill)
        var obj = serialize(match);
        var query = "INSERT INTO yasp.matches JSON ?";
        cassandra.execute(query, [JSON.stringify(obj)],
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
                var query2 = "INSERT INTO yasp.player_matches JSON ?";
                pm.match_id = match.match_id;
                var obj2 = serialize(pm);
                cassandra.execute(query2, [JSON.stringify(obj2)],
                {
                    prepare: true
                }, cb);
            }, cb);
        });
    }

    function serialize(row)
    {
        var obj = {};
        for (var key in row)
        {
            if (row[key] && typeof(row[key]) === "object")
            {
                obj[key] = JSON.stringify(row[key]);
            }
            else if (row[key] !== null)
            {
                obj[key] = row[key];
            }
        }
        return obj;
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
        {}, cb);
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
            options.timeout = 180000;
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

function getMatch(db, match_id, cb)
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
                players.forEach(function(p)
                {
                    computePlayerMatchData(p);
                });
                match.players = players;
                computeMatchData(match);
                return cb(err, match);
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

function getMatchCassandra()
{}

function getPlayerMatchesCassandra()
{}

function getPlayerRatings(db, account_id, cb)
{
    if (!isNaN(account_id))
    {
        db.from('player_ratings').where(
        {
            account_id: Number(account_id)
        }).orderBy('time', 'asc').asCallback(cb);
    }
    else
    {
        cb();
    }
}

function getPlayer(db, account_id, cb)
{
    if (!isNaN(account_id))
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
module.exports = {
    getSets: getSets,
    insertPlayer: insertPlayer,
    insertMatch: insertMatch,
    insertPlayerRating: insertPlayerRating,
    insertMatchSkill: insertMatchSkill,
    getMatch: getMatch,
    getPlayerMatches: getPlayerMatches,
    getPlayerRatings: getPlayerRatings,
    getPlayer: getPlayer,
    upsert: upsert
};
