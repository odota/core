/**
 * Functions to build/cache match object
 **/
var config = require('../config');
var queries = require('./queries');
var db = require('../store/db');
var redis = require('../store/redis');
var getMatch = queries.getMatch;

function buildMatch(options, cb)
{
    var match_id = options.match_id;
    var key = "match:" + match_id;
    redis.get(key, function(err, reply)
    {
        if (err)
        {
            return cb(err);
        }
        else if (reply)
        {
            console.log("Cache hit for match " + match_id);
            var match = JSON.parse(reply);
            return cb(err, match);
        }
        else
        {
            console.log("Cache miss for match " + match_id);
            getMatch(db, redis, match_id, options, function(err, match)
            {
                if (err)
                {
                    return cb(err);
                }
                if (match.version && config.ENABLE_MATCH_CACHE)
                {
                    redis.setex(key, 3600, JSON.stringify(match));
                }
                return cb(err, match);
            });
        }
    });
}
module.exports = buildMatch;