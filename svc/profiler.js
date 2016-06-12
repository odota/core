/**
 * Worker to fetch updated player profiles
 **/
var constants = require('../constants');
var queries = require('../store/queries');
var db = require('../store/db');
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
    db.raw(`
        SELECT account_id 
        FROM players 
        TABLESAMPLE SYSTEM_ROWS(100)
    `).asCallback(function(err, results)
    {
        if (err)
        {
            return cb(err);
        }
        if (results.rows.length === 0)
        {
            console.log('No account_ids found...');
            return cb();
        }
        console.log('players sampled: %s', results.rows.length);
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
