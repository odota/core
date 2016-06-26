/**
 * Worker to fetch updated player profiles
 **/
var constants = require('../constants');
var config = require('../config');
var queries = require('../store/queries');
var db = require('../store/db');
var redis = require('../store/redis');
var utility = require('../util/utility');
var insertPlayer = queries.insertPlayer;
var getData = utility.getData;
var async = require('async');
start();

function start()
{
    getSummaries(function(err)
    {
        if (err)
        {
            throw err;
        }
        return setTimeout(start, 1000);
    });
}

function getSummaries(cb)
{
    redis.lrange('profilerQueue', 0, -1, function(err, results)
    {
        if (err)
        {
            return cb(err);
        }
        console.log('players sampled: %s', results.length);
        results = results.map(function(account_id)
        {
            return {
                account_id: account_id
            };
        });
        var container = utility.generateJob("api_summaries",
        {
            players: results
        });
        getData(container.url, function(err, body)
        {
            if (err)
            {
                //couldn't get data from api, non-retryable
                return cb(JSON.stringify(err));
            }
            //player summaries response
            async.each(body.response.players, function(player, cb)
            {
                insertPlayer(db, player, cb);
            }, cb);
        });
    });
}
