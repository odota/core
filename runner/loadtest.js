var db = require('../db');
var async = require('async');
var request = require('request');
var host = "localhost:5000";
module.exports = function(cb)
{
    db.select('account_id').from('players').orderBy('account_id', 'asc').limit(10000).asCallback(function(err, results)
    {
        async.eachLimit(results, 10, function(r, cb)
        {
            console.time(r.account_id);
            request("http://" + host + "/players/" + r.account_id, function(err, resp, body)
            {
                console.timeEnd(r.account_id);
                cb(err);
            });
        }, cb);
    });
};