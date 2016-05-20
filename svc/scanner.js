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
var parallelism = config.SCANNER_PARALLELISM;
var PAGE_SIZE = 100;
buildSets(db, redis, function(err)
{
    if (err)
    {
        throw err;
    }
    start();
});

function start()
{
    if (config.START_SEQ_NUM)
    {
        redis.get("match_seq_num", function(err, result)
        {
            if (err || !result)
            {
                console.log('failed to get match_seq_num from redis, waiting to retry');
                return setTimeout(start, 10000);
            }
            //stagger
            result = Number(result);
            scanApi(result);
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
            var arr = [];
            for (var i = 0; i < parallelism; i++)
            {
                arr.push(seq_num + i * PAGE_SIZE);
            }
            var matchBuffer = {};
            var next_seq_num = seq_num;
            //async parallel calls
            async.each(arr, function(match_seq_num, cb)
            {
                var container = generateJob("api_sequence",
                {
                    start_at_match_seq_num: match_seq_num
                });
                getData(
                {
                    url: container.url,
                    delay: Number(config.SCANNER_DELAY),
                    proxyAffinityRange: parallelism,
                }, function(err, data)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    var resp = data.result && data.result.matches ? data.result.matches : [];
                    if (resp.length >= PAGE_SIZE)
                    {
                        //page is complete
                        next_seq_num = Math.max(next_seq_num, resp[PAGE_SIZE - 1].match_seq_num + 1);
                    }
                    console.log("[API] match_seq_num:%s, matches:%s", match_seq_num, resp.length);
                    resp.forEach(function(m)
                    {
                        matchBuffer[m.match_id] = m;
                    });
                    cb(err);
                });
            }, function(err)
            {
                if (err)
                {
                    return scanApi(seq_num);
                }
                console.log('%s distinct matches found in %s pages', Object.keys(matchBuffer).length, parallelism);
                async.each(Object.keys(matchBuffer), function(k, cb)
                {
                    var match = matchBuffer[k];
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
                    //check if match was previously processed
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
                                    //mark with long-lived key to indicate complete (persist between restarts)
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
                        console.log("next_seq_num: %s", next_seq_num);
                        redis.set("match_seq_num", next_seq_num);
                        //completed inserting matches on this page
                        return scanApi(next_seq_num);
                    }
                });
            });
        });
    }
}
