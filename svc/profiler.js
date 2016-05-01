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
var max;
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
    db.raw(`select max(match_id) from matches`).asCallback(function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        max = Number(result.rows[0].max);
        var min = max - 10000000;
        db.raw(`
        select distinct account_id 
        from player_matches 
        where match_id in (SELECT (?::bigint + random()*(?::bigint - ?::bigint))::bigint as rand                                                                                                                                                         
        from generate_series(1,50))
        and account_id < ? limit 100
        `, [min, max, min, constants.anonymous_account_id]).asCallback(function(err, results)
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
    });
}
