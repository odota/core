var async = require('async');
var utility = require('../util/utility');
var generateJob = utility.generateJob;
var getData = utility.getData;
var db = require('../store/db');
var redis = require('../store/redis');
var cassandra = require('../store/cassandra');
var queries = require('../store/queries');
var insertMatch = queries.insertMatch;
var args = process.argv.slice(2);
var match_id = Number(args[0]);
var delay = 1000;
var job = generateJob("api_details",
{
    match_id: match_id
});
var url = job.url;
getData(
{
    url: url,
    delay: delay
}, function(err, body)
{
    if (err)
    {
        throw err;
    }
    if (body.result)
    {
        var match = body.result;
        match.parse_status = 0;
        insertMatch(db, redis, match,
        {
            skipCounts: true,
            skipAbilityUpgrades: true,
            cassandra: cassandra,
        }, function(err)
        {
            if (err)
            {
                throw err;
            }
            process.exit(0);
        });
    }
    else
    {
        throw body;
    }
});