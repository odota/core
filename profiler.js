var queries = require('./queries');
var insertPlayer = queries.insertPlayer;
var utility = require('./utility');
var getData = utility.getData;
var async = require('async');
var db = require('./db');
start();

function start()
{
    getSummaries(function(err)
    {
        if (err)
        {
            console.error(err);
        }
        return setTimeout(start, 1000);
    });
}

function getSummaries(cb)
{
    db.raw("select account_id from players offset random() * (select count(*) from players) limit 100").asCallback(function(err, results)
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