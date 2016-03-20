var JSONStream = require('JSONStream');
var db = require('../db');
var cassandra = require('../cassandra');
var utility = require('../utility');
var serialize = utility.serialize;
var args = process.argv.slice(2);
var start_id = Number(args[1]) || 0;
var tbl = args[0];
var stream = db.select("*").from(tbl).where('match_id', '>=', start_id).orderBy("match_id", "asc").stream();
stream.on('end', exit);
stream.pipe(JSONStream.parse());
stream.on('data', function(match)
{
    stream.pause();
    var funcs = {
        "matches": insertMatch,
        "player_matches": insertPlayerMatch
    };
    funcs[tbl](match, function(err)
    {
        if (err)
        {
            return exit(err);
        }
        console.log(match.match_id, match.player_slot);
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

function insertMatch(match, cb)
{
    var obj = serialize(match);
    var query = "INSERT INTO yasp.matches JSON ?";
    cassandra.execute(query, [JSON.stringify(obj)],
    {
        prepare: true
    }, cb);
}

function insertPlayerMatch(pm, cb)
{
    var obj2 = serialize(pm);
    var query2 = "INSERT INTO yasp.player_matches JSON ?";
    cassandra.execute(query2, [JSON.stringify(obj2)],
    {
        prepare: true
    }, cb);
}
