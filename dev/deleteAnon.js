var db = require('../db');
var async = require('async');
var args = process.argv.slice(2);
var start_id = Number(args[1]) || 0;
var end_id = 2400000000;
var bucket = 10000000;
var starts = [];
for (var i = start_id; i < end_id; i += bucket)
{
    starts.push(i);
}
async.eachSeries(starts, function(s, cb)
{
    var q = db.raw(`UPDATE player_matches SET account_id = NULL WHERE account_id = 4294967295 AND match_id >= ? AND match_id < ?; `, [s, s + bucket]);
    console.log(q.toString());
    q.asCallback(function(err, resp)
    {
        console.log(resp);
        cb(err);
    });
}, function(err)
{
    if (err)
    {
        console.error(err);
    }
    process.exit(Number(err));
});