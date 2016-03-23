var JSONStream = require('JSONStream');
var async = require('async');
var db = require('../db');
var redis = require('../redis');
var queries = require('../queries');
var args = process.argv.slice(2);
var start_id = Number(args[0]) || 0;
var cassandra = require('../cassandra');
var stream = db.raw(`
SELECT account_id from players;
`, []).stream();
stream.on('end', exit);
stream.pipe(JSONStream.parse());
stream.on('data', function(player)
{
    stream.pause();
    console.time(player.account_id);
    cassandra.execute(`SELECT * from player_matches WHERE account_id = ?`, [player.account_id], function(err, result)
    {
        if (err)
        {
            return exit(err);
        }
        //console.log(player.account_id, result.length);
        console.timeEnd(player.account_id);
        stream.resume();
    });
});

function exit(err)
{
    if (err)
    {
        console.error(err);
    }
    process.exit(Number(err));
}