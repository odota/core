module.exports = buildMatch;
var compute = require('./compute');
var config = require('./config');
var queries = require('./queries');
var computeMatchData = compute.computeMatchData;
var computePlayerMatchData = compute.computePlayerMatchData;
var renderMatch = compute.renderMatch;
var getMatch = queries.getMatch;

function buildMatch(options, cb)
{
    var db = options.db;
    var redis = options.redis;
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
            getMatch(db, match_id, function(err, match)
            {
                if (err)
                {
                    return cb(err);
                }
                //get ability upgrades data
                redis.get('ability_upgrades:' + match_id, function(err, result)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    result = JSON.parse(result);
                    if (match.players && result)
                    {
                        match.players.forEach(function(p)
                        {
                            p.ability_upgrades_arr = result[p.player_slot];
                        });
                    }
                    renderMatch(match);
                    //remove some duplicated columns from match.players to reduce saved size
                    if (match.players)
                    {
                        match.players.forEach(function(p)
                        {
                            delete p.chat;
                            delete p.objectives;
                            delete p.teamfights;
                        });
                    }
                    if (match.version && config.ENABLE_MATCH_CACHE)
                    {
                        redis.setex(key, 3600, JSON.stringify(match));
                    }
                    return cb(err, match);
                });
            });
        }
    });
}