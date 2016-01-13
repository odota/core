var queries = require('./queries');
var insertPlayer = queries.insertPlayer;
var utility = require('./utility');
var getData = utility.getData;
var async = require('async');
var db = require('./db');
var count;
start();
doCount();

function doCount()
{
    db.raw("select count(*) from players").asCallback(function(err, result)
    {
        if (err)
        {
            throw err;
        }
        count = Number(result.rows[0].count);
        console.log("recomputed count: %s", count);
        return setTimeout(doCount, 60 * 10 * 1000);
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
    if (!count)
    {
        console.log('waiting for count');
        return cb();
    }
    db.raw("select account_id from players offset random() * ? limit 100", [count]).asCallback(function(err, results)
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