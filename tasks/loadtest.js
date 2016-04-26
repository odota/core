var db = require('../db');
var async = require('async');
var request = require('request');
var host = "localhost:5000";
db.select('account_id', 'last_login').from('players').whereNotNull('last_login').orderBy('last_login').orderBy('account_id').asCallback(function(err, results)
{
    if (err)
    {
        return cb(err);
    }
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

function cb(err)
{
    process.exit(Number(err));
}