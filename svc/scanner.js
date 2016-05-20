/**
 * Worker scanning the Steam sequential match API (GetMatchHistoryBySequenceNum) for latest matches.
 **/
var utility = require('../util/utility');
var config = require('../config');
var buildSets = require('../store/buildSets');
var db = require('../store/db');
var cassandra = config.ENABLE_CASSANDRA_MATCH_STORE_WRITE ? require('../store/cassandra') : undefined;
var redis = require('../store/redis');
var queries = require('../store/queries');
var insertMatch = queries.insertMatch;
var getData = utility.getData;
var generateJob = utility.generateJob;
var async = require('async');
var trackedPlayers;
var userPlayers;
var PARALLELISM = config.SCANNER_PARALLELISM;
var PAGE_SIZE = 100;
buildSets(db, redis, function(err)
{
    if (err)
    {
        throw err;
    }
    for (var i = 0; i < PARALLELISM; i++)
    {
        start(i);
    }
});

function start(id)
{
    if (config.START_SEQ_NUM)
    {
        redis.hget("match_seq_num_hash", id, function(err, result)
        {
            if (err || !result)
            {
                console.log('failed to get match_seq_num from redis, trying sequence number of worker 0');
                redis.hget("match_seq_num_hash", "0", function(err, result)
                {
                    if (err || !result)
                    {
                        console.log('failed to get worker 0 match_seq_num from redis, waiting to retry');
                        return setTimeout(start, 10000);
                    }
                    //stagger
                    result = Number(result);
                    scanApi(result + id * PAGE_SIZE);
                });
            }
            else
            {
                result = Number(result);
                scanApi(result);
            }
        });
    }
    else if (config.NODE_ENV !== "production")
    {
        //never do this in production to avoid skipping sequence number if we didn't pull .env properly
        var container = generateJob("api_history",
        {});
        getData(container.url, function(err, data)
        {
            if (err)
            {
                console.log("failed to get sequence number from webapi");
                return start();
            }
            scanApi(data.result.matches[0].match_seq_num);
        });
    }
    else
    {
        throw "failed to initialize sequence number";
    }

    function scanApi(seq_num)
    {
        var container = generateJob("api_sequence",
        {
            start_at_match_seq_num: seq_num
        });
        queries.getSets(redis, function(err, result)
        {
            if (err)
            {
                console.log("failed to getSets from redis");
                return scanApi(seq_num);
            }
            //set local vars
            trackedPlayers = result.trackedPlayers;
            userPlayers = result.userPlayers;
            getData(
            {
                url: container.url,
                delay: Number(config.SCANNER_DELAY),
                proxyAffinityRange: PARALLELISM,
            }, function(err, data)
            {
                if (err)
                {
                    return scanApi(seq_num);
                }
                var resp = data.result && data.result.matches ? data.result.matches : [];
                var next_seq_num = seq_num;
                if (resp.length === PAGE_SIZE)
                {
                    next_seq_num = seq_num + PARALLELISM * PAGE_SIZE;
                }
                console.log("[API] seq_num:%s, matches:%s", seq_num, resp.length);
                async.each(resp, function(match, cb)
                {
                    if (config.ENABLE_PRO_PARSING && match.leagueid)
                    {
                        //parse tournament games
                        match.parse_status = 0;
                    }
                    else if (match.players.some(function(p)
                        {
                            return (p.account_id in trackedPlayers);
                        }))
                    {
                        //queued
                        match.parse_status = 0;
                    }
                    else if (match.players.some(function(p)
                        {
                            return (config.ENABLE_INSERT_ALL_MATCHES || p.account_id in userPlayers);
                        }))
                    {
                        //skipped
                        match.parse_status = 3;
                    }
                    redis.get('scanner_insert:' + match.match_id, function(err, result)
                    {
                        //don't insert this match if we already processed it recently
                        if (match.parse_status === 0 || match.parse_status === 3 && !result)
                        {
                            insertMatch(db, redis, match,
                            {
                                type: "api",
                                origin: "scanner",
                                cassandra: cassandra,
                                userPlayers: userPlayers,
                            }, function(err)
                            {
                                if (!err)
                                {
                                    redis.setex('scanner_insert:' + match.match_id, 3600 * 8, 1);
                                }
                                close(err);
                            });
                        }
                        else
                        {
                            close(err);
                        }
                    });

                    function close(err)
                    {
                        if (err)
                        {
                            console.error("failed to insert match from scanApi %s", match.match_id);
                            console.error(err);
                        }
                        return cb(err);
                    }
                }, function(err)
                {
                    if (err)
                    {
                        //something bad happened, retry this page
                        console.error(err);
                        return scanApi(seq_num);
                    }
                    else
                    {
                        redis.hset("match_seq_num_hash", id, next_seq_num);
                        //completed inserting matches on this page
                        return scanApi(next_seq_num);
                    }
                });
            });
        });
    }
}
