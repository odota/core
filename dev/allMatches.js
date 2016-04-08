var utility = require('../utility');
var generateJob = utility.generateJob;
var async = require('async');
var getData = utility.getData;
var db = require('../db');
var redis = require('../redis');
var args = process.argv.slice(2);
var start_seq_num = Number(args[0]) || 0;
var end_seq_num = Number(args[1]) || 0;
var delay = Number(args[2]) || 1000;
const cluster = require('cluster');
//match seq num 59622 has a 32-bit unsigned int max (4294967295) in one of the players' tower damage
//match seq num 239190 for hero_healing
//match seq num 542284 for hero_healing
//may need to cap values down to 2.1b if we encounter them
//postgres int type only supports up to 2.1b (signed int)
//bucket idspace into groups of 100000000
//save progress to redis key complete_history:n
var bucket_size = 100000000;
var columnInfo = {};
if (cluster.isMaster)
{
    // Fork workers.
    for (var i = start_seq_num; i < end_seq_num; i += bucket_size)
    {
        cluster.fork(
        {
            BUCKET: i
        });
    }
    cluster.on('exit', (worker, code, signal) =>
    {
        if (code !== 0)
        {
            throw 'worker died';
        }
        else
        {
            console.error('worker exited successfully');
        }
    });
}
else
{
    var bucket = Number(process.env.BUCKET);
    getColumnInfo(db, 'matches', function(err)
    {
        getColumnInfo(db, 'player_matches', function(err)
        {
            redis.get('complete_history:' + bucket, function(err, result)
            {
                if (err)
                {
                    throw err;
                }
                result = result ? Number(result) : bucket;
                getPage(result, bucket);
            });
        });
    });
}

function getPage(match_seq_num, bucket)
{
    if (match_seq_num > bucket + bucket_size)
    {
        process.exit(0);
    }
    var job = generateJob("api_sequence",
    {
        start_at_match_seq_num: match_seq_num
    });
    var url = job.url;
    getData(
    {
        url: url,
        delay: delay
    }, function(err, body)
    {
        if (err)
        {
            throw err;
        }
        if (body.result)
        {
            var matches = body.result.matches;
            async.each(matches, function(match, cb)
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
                db.transaction(function(trx)
                {
                    async.series(
                    {
                        "imt": insertMatchTable,
                        "ipmt": insertPlayerMatchesTable,
                    }, function(err, results)
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
                            //treat already exists as non-error and continue
                            console.error("match %s already exists", match.match_id);
                            err = null;
                        }
                        return cb(err);
                    });

                    function insertMatchTable(cb)
                    {
                        var row = match;
                        insert(trx, 'matches', row,
                        {
                            match_id: match.match_id
                        }, cb);
                    }

                    function insertPlayerMatchesTable(cb)
                    {
                        async.each(players || [], function(pm, cb)
                        {
                            pm.match_id = match.match_id;
                            insert(trx, 'player_matches', pm,
                            {
                                match_id: pm.match_id,
                                player_slot: pm.player_slot
                            }, cb);
                        }, cb);
                    }
                });
            }, function(err)
            {
                if (err)
                {
                    throw err;
                }
                var next_seq_num = matches[matches.length - 1].match_seq_num + 1;
                redis.set('complete_history:' + bucket, next_seq_num);
                return getPage(next_seq_num, bucket);
            });
        }
        else
        {
            throw body;
        }
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

function insert(db, table, row, conflict, cb)
{
    for (var key in row)
    {
        if (!(key in columnInfo[table]))
        {
            delete row[key];
            //console.error(key);
        }
    }
    db(table).insert(row).asCallback(cb);
}