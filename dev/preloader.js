var JSONStream = require('JSONStream');
var config = require('../config');
var constants = require('../constants');
var db = require('../db');
var request = require('request');
var args = process.argv.slice(2);
var limit = Number(args[1]) || 100000;
var conc = 0;
var stream = db.raw(`
SELECT account_id, match_id
FROM player_matches
ORDER BY match_id DESC
LIMIT ?;
`, [limit]).stream();
stream.on('end', exit);
stream.pipe(JSONStream.parse());
stream.on('data', function(player)
{
    if (!player.account_id || player.account_id === constants.anonymous_account_id)
    {
        return;
    }
    conc += 1;
    if (conc > 5)
    {
        stream.pause();
    }
    request(config.ROOT_URL + "/api/players/" + player.account_id, function(err, resp, body)
    {
        if (err || resp.statusCode !== 200)
        {
            console.error(err || resp.statusCode);
        }
        console.log(player.account_id);
        setTimeout(function()
        {
            stream.resume();
        }, 2000);
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