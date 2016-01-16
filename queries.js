var async = require('async');
var utility = require('./utility');
var convert64to32 = utility.convert64to32;
var queueReq = utility.queueReq;
var compute = require('./compute');
var computePlayerMatchData = compute.computePlayerMatchData;
var computeMatchData = compute.computeMatchData;
var aggregator = require('./aggregator');
var constants = require('./constants');
var filter = require('./filter');
var util = require('util');
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

function upsert(db, table, row, conflict, cb)
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
        var query1 = db(table).insert(row);
        var query2 = db(table).update(row).where(conflict);
        query1.asCallback(function(err)
        {
            if (err && err.detail.indexOf("already exists") !== -1)
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
            return util.format("%s = %s", key, genValue(row, key));
        }).join(',');
        var query = util.format("insert into %s (%s) values (%s) on conflict() do update set %s", table, Object.keys(row).join(','), values, Object.keys(conflict).join(','), table, update);
        require('fs').writeFileSync('output.json', query);
        db.raw(query).asCallback(cb);
        */
    });
}

function genValue(row, key)
{
    return row[key] && row[key].constructor === Array ? util.format("ARRAY[%s]", row[key].map(function(e)
    {
        //no string arrays or nested arrays!
        return util.format("'%s'%s", JSON.stringify(e), typeof(e) === "object" ? "::json" : "::integer");
    }).join(',')) : util.format("'%s'", JSON.stringify(row[key]));
}

function insertMatch(db, redis, queue, match, options, cb)
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
    if (players && !options.skipAbilityUpgrades)
    {
        var ability_upgrades = {};
        players.forEach(function(p)
        {
            ability_upgrades[p.player_slot] = p.ability_upgrades ? p.ability_upgrades.map(function(au)
            {
                return au.ability;
            }) : null;
        });
        redis.setex("ability_upgrades:" + match.match_id, 60 * 60 * 24 * 7, JSON.stringify(ability_upgrades));
    }
    //options.type specify api, parse, or skill
    //we want to insert into matches, then insert into player_matches for each entry in players
    //db.transaction(function(trx){
    async.series(
    {
        "imt": insertMatchTable,
        "ipmt": insertPlayerMatchesTable,
        "ep": ensurePlayers,
        "pc": updatePlayerCaches,
        "cmc": clearMatchCache,
        "dp": decideParse
    }, function(err, results)
    {
        /*
        if (err)
        {
            trx.rollback(err);
        }
        else
        {
            trx.commit();
        }
        */
        return cb(err, results.dp);
    });
    //}).catch(cb);
    function insertMatchTable(cb)
    {
        var row = match;
        upsert(db, 'matches', row,
        {
            match_id: match.match_id
        }, cb);
    }

    function insertPlayerMatchesTable(cb)
    {
        //we can skip this if we have no players (skill case)
        async.each(players || [], function(pm, cb)
        {
            pm.match_id = match.match_id;
            upsert(db, 'player_matches', pm,
            {
                match_id: pm.match_id,
                account_id: pm.account_id
            }, cb);
        }, cb);
    }
    /**
     * Inserts a placeholder player into db with just account ID for each player in this match
     **/
    function ensurePlayers(cb)
    {
        if (options.skipInsertPlayers)
        {
            return cb();
        }
        async.each(players || [], function(p, cb)
        {
            insertPlayer(db,
            {
                account_id: p.account_id
            }, cb);
        }, cb);
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
        queueReq(queue, "cache", copy,
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
            return queueReq(queue, "parse", match, options, function(err, job2)
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
};
