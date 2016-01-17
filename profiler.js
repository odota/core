var queries = require('./queries');
var insertPlayer = queries.insertPlayer;
var utility = require('./utility');
var getData = utility.getData;
var async = require('async');
var db = require('./db');
var max;
start();
doMax();

function doMax()
{
    db.raw("select max(account_id) from players").asCallback(function(err, result)
    {
        if (err)
        {
            throw err;
        }
        max = Number(result.rows[0].max);
        console.log("recomputed max: %s", max);
        return setTimeout(doMax, 60 * 10 * 1000);
    });
}

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
    if (!max)
    {
        console.log('waiting for max');
        return cb();
    }
    var random = Math.floor((Math.random()*max)); 
    db.raw("select account_id from players where account_id > ? limit 100", [random]).asCallback(function(err, results)
    {
        if (err)
        {
            return cb(err);
        }
        var container = utility.generateJob("api_summaries",
        {
            players: results.rows
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