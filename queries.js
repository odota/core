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
var columnInfo = null;

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

function getColumnInfo(db, cb)
{
    if (columnInfo)
    {
        return cb();
    }
    else
    {
        async.parallel(
        {
            "matches": function(cb)
            {
                db('matches').columnInfo().asCallback(cb);
            },
            "player_matches": function(cb)
            {
                db('player_matches').columnInfo().asCallback(cb);
            },
            "players": function(cb)
            {
                db('players').columnInfo().asCallback(cb);
            },
            "player_ratings": function(cb)
            {
                db('player_ratings').columnInfo().asCallback(cb);
            }
        }, function(err, results)
        {
            columnInfo = results;
            cb(err);
        });
    }
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
    //options.type specify api, parse, or skill
    //we want to insert into matches, then insert into player_matches for each entry in players
    //db.transaction(function(trx) {
    async.series([
        function(cb)
        {
            getColumnInfo(db, cb);
        },
        insertMatchTable,
        insertPlayerMatchesTable,
        ensurePlayers,
        updatePlayerCaches,
        clearMatchCache
        ], decideParse);

    function insertMatchTable(cb)
    {
        var row = match;
        for (var key in row)
        {
            if (!(key in columnInfo.matches))
            {
                delete row[key];
                //console.error(key);
            }
        }
        /*
        //TODO use psql upsert when available
        //TODO this breaks transactions, transaction will refuse to complete if error occurred during insert
        //upsert on api, update only otherwise
        console.log(        db.raw("insert into matches (?) values (?) on conflict do update set ?", [Object.keys(row).join(','), Object.keys(row).map(function(key)
        {
            return row[key];
        }).join(','), Object.keys(row).map(function(key)
        {
            return key + " = " + JSON.stringify(row[key]);
        }).join(',')]).toString());
        db.raw("insert into matches (?) values (?) on conflict do update set ?", [Object.keys(row).join(','), Object.keys(row).map(function(key)
        {
            return row[key];
        }).join(','), Object.keys(row).map(function(key)
        {
            return key + " = " + JSON.stringify(row[key]);
        }).join(',')]).asCallback(function(err){
            console.error(err);
            cb(err);
        });
        */
        db('matches').insert(row).where(
        {
            match_id: row.match_id
        }).asCallback(function(err)
        {
            if (err && err.detail.indexOf("already exists") !== -1)
            {
                //try update
                db('matches').update(row).where(
                {
                    match_id: row.match_id
                }).asCallback(cb);
            }
            else
            {
                cb(err);
            }
        });
    }

    function insertPlayerMatchesTable(cb)
    {
        //we can skip this if we have no players (skill case)
        async.each(players || [], function(pm, cb)
        {
            var row = pm;
            for (var key in row)
            {
                if (!(key in columnInfo.player_matches))
                {
                    delete row[key];
                    //console.error(key);
                }
            }
            row.match_id = match.match_id;
            //TODO upsert
            //upsert on api, update only otherwise
            if (options.type === "api")
            {
                db('player_matches').insert(row).where(
                {
                    match_id: row.match_id,
                    player_slot: row.player_slot
                }).asCallback(function(err)
                {
                    if (err && err.detail.indexOf("already exists") !== -1)
                    {
                        db('player_matches').update(row).where(
                        {
                            match_id: row.match_id,
                            player_slot: row.player_slot
                        }).asCallback(cb);
                    }
                    else
                    {
                        cb(err);
                    }
                });
            }
            else
            {
                db('player_matches').update(row).where(
                {
                    match_id: row.match_id,
                    player_slot: row.player_slot
                }).asCallback(cb);
            }
        }, cb);
    }
    /**
     * Inserts a placeholder player into db with just account ID for each player in this match
     **/
    function ensurePlayers(cb)
    {
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

    function decideParse(err)
    {
        if (err)
        {
            //trx.rollback(err);
            return cb(err);
        }
        //trx.commit();
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
    /*
    });
    .catch(function(err){
        console.error(err);
    });
    */
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
    getColumnInfo(db, function(err)
    {
        if (err)
        {
            return cb(err);
        }
        var row = player;
        for (var key in row)
        {
            if (!(key in columnInfo.players))
            {
                delete row[key];
                //console.error(key);
            }
        }
        //TODO upsert
        db('players').insert(row).asCallback(function(err)
        {
            if (err && err.detail.indexOf("already exists") !== -1)
            {
                db('players').update(row).where(
                {
                    account_id: row.account_id
                }).asCallback(cb);
            }
            else
            {
                return cb(err);
            }
        });
    });
}

function insertPlayerRating(db, row, cb)
{
    db('player_ratings').insert(row).asCallback(cb);
}

function insertPlayerCache(db, player, cache, cb)
{
    //TODO upsert
    db('player_caches').insert(
    {
        account_id: player.account_id,
        cache: cache
    }).asCallback(function(err)
    {
        if (err && err.detail.indexOf("already exists") !== -1)
        {
            db('player_caches').update(
            {
                cache: cache
            }).where(
            {
                account_id: player.account_id
            }).asCallback(function(err)
            {
                return cb(err, player);
            });
        }
        else
        {
            return cb(err, player);
        }
    });
}

function insertMatchSkill(db, row, cb)
{
    //TODO upsert
    db('match_skill').insert(row).asCallback(function(err)
    {
        if (err && err.detail.indexOf("already exists") !== -1)
        {
            db('match_skill').update(row).where(
            {
                match_id: row.match_id
            }).asCallback(cb);
        }
        else
        {
            return cb(err);
        }
    });
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

function getPlayerMatches(db, query, cb)
{
    console.log(query);
    console.time('getting player_matches');
    db.select(query.project).from('player_matches').where(query.db_select).limit(query.limit).orderBy('player_matches.match_id', 'desc').innerJoin('matches', 'player_matches.match_id', 'matches.match_id').leftJoin('match_skill', 'player_matches.match_id', 'match_skill.match_id').asCallback(function(err, player_matches)
    {
        if (err)
        {
            return cb(err);
        }
        console.timeEnd('getting player_matches');
        //compute, filter, agg should act on player_matches joined with matches
        console.time('computing additional data');
        player_matches.forEach(function(m)
        {
            //post-process the match to get additional stats
            computePlayerMatchData(m);
        });
        console.timeEnd('computing additional data');
        var filtered = filter(player_matches, query.js_select);
        console.time('computing aggregations');
        var aggData = aggregator(filtered, query.js_agg);
        console.timeEnd('computing aggregations');
        var result = {
            aggData: aggData,
            //page: filtered.slice(query.js_skip, query.js_skip + query.js_limit),
            //data: filtered,
            raw: player_matches,
        };
        cb(err, result);
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
    insertPlayerCache: insertPlayerCache,
    insertMatchSkill: insertMatchSkill,
    getMatch: getMatch,
    getPlayerMatches: getPlayerMatches,
    getPlayerRatings: getPlayerRatings,
    getPlayer: getPlayer,
};
