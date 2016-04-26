/**
 * Worker scanning the Steam sequential match API (GetMatchHistoryBySequenceNum) for latest matches.
 **/
var utility = require('../util/utility');
var config = require('../config');
var constants = require('../constants');
var buildSets = require('../store/buildSets');
var db = require('../store/db');
var cassandra = config.ENABLE_CASSANDRA_MATCH_STORE_WRITE ? require('../store/cassandra') : undefined;
var redis = require('../store/redis');
var queue = require('../store/queue');
var queries = require('../store/queries');
var insertMatch = queries.insertMatch;
var getData = utility.getData;
var addToQueue = queue.addToQueue;
var mQueue = queue.getQueue('mmr');
var logger = utility.logger;
var generateJob = utility.generateJob;
var async = require('async');
var trackedPlayers;
var userPlayers;
// Used to create endpoint for monitoring
var express = require('express');
var moment = require('moment');
var app = express();
var port = config.PORT || config.SCANNER_PORT;
var startedAt = moment();
app.route("/").get(function(req, res)
{
    redis.get("match_seq_num", function(err, result)
    {
        res.json(
        {
            started_at: startedAt.format(),
            started_ago: startedAt.fromNow(),
            match_seq_num: result || "NOT FOUND"
        });
    });
});
var server = app.listen(port, function()
{
    var host = server.address().address;
    console.log('[SCANNER] listening at http://%s:%s', host, port);
});
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
    if (config.START_SEQ_NUM === "REDIS")
    {
        redis.get("match_seq_num", function(err, result)
        {
            if (err || !result)
            {
                console.log('failed to get match_seq_num from redis, retrying');
                return setTimeout(start, 10000);
            }
            result = Number(result);
            scanApi(result);
        });
    }
    else if (config.START_SEQ_NUM)
    {
        scanApi(config.START_SEQ_NUM);
    }
    else
    {
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
            proxyAffinityRange: 4
        }, function(err, data)
        {
            if (err)
            {
                return scanApi(seq_num);
            }
            var resp = data.result && data.result.matches ? data.result.matches : [];
            var next_seq_num = seq_num;
            if (resp.length)
            {
                next_seq_num = resp[resp.length - 1].match_seq_num + 1;
            }
            logger.info("[API] seq_num:%s, matches:%s", seq_num, resp.length);
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
                async.each(match.players, function(p, cb)
                {
                    async.parallel(
                    {
                        "decideMmr": function(cb)
                        {
                            if (match.lobby_type === 7 && p.account_id !== constants.anonymous_account_id && (p.account_id in userPlayers || (config.ENABLE_RANDOM_MMR_UPDATE && match.match_id % 5 === 0)))
                            {
                                addToQueue(mQueue,
                                {
                                    match_id: match.match_id,
                                    account_id: p.account_id
                                },
                                {
                                    attempts: 1
                                }, cb);
                            }
                            else
                            {
                                cb();
                            }
                        }
                    }, cb);
                }, function(err)
                {
                    if (match.parse_status === 0 || match.parse_status === 3)
                    {
                        insertMatch(db, redis, match,
                        {
                            type: "api",
                            origin: "scanner",
                            cassandra: cassandra,
                        }, close);
                    }
                    else
                    {
                        close(err);
                    }

                    function close(err)
                    {
                        if (err)
                        {
                            console.error("failed to insert match from scanApi %s", match.match_id);
                            console.error(err);
                        }
                        return cb(err);
                    }
                });
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
                    redis.set("match_seq_num", next_seq_num);
                    //completed inserting matches on this page
                    return scanApi(next_seq_num);
                }
            });
        });
    });
}
