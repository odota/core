var JSONStream = require('JSONStream');
var db = require('../db');
var cassandra = require('../cassandra');
var args = process.argv.slice(2);
var start_id = Number(args[0]) || 0;
var tbl = args[1];
var stream = db.select("*").from(args[1]).where('match_id', '>=', start_id).orderBy("match_id", "asc").stream();
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
        console.log(match.match_id);
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

function serialize(row)
{
    var obj = {};
    for (var key in row)
    {
        if (row[key] && typeof(row[key]) === "object")
        {
            obj[key] = JSON.stringify(row[key]);
        }
        else if (row[key] !== null)
        {
            obj[key] = row[key];
        }
    }
    return obj;
}