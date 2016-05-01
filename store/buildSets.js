/**
 * Function to build/cache sets of players
 **/
var async = require('async');
module.exports = function buildSets(db, redis, cb) {
    console.log("rebuilding sets");
    async.parallel({
        //players in this set have their matches parsed
        "trackedPlayers": function(cb) {
            redis.keys("visit:*", function(err, result) {
                var t = {};
                result.forEach(function(redis_key) {
                    var account_id = redis_key.split(":")[1];
                    t[account_id] = true;
                });
                //console.log(t);
                cb(err, t);
            });
        },
        //users in this set have their matches added
        "userPlayers": function(cb) {
            db.select(['account_id']).from('players').whereNotNull('last_login').asCallback(function(err, docs) {
                if (err) {
                    return cb(err);
                }
                var t = {};
                docs.forEach(function(player) {
                    t[player.account_id] = true;
                });
                //console.log(t);
                cb(err, t);
            });
        },
        //users in this set are added to the trackedPlayers set
        "donators": function(cb) {
            db.select(['account_id']).from('players').where('cheese', '>', 0).asCallback(function(err, docs) {
                if (err) {
                    return cb(err);
                }
                var t = {};
                docs.forEach(function(player) {
                    t[player.account_id] = true;
                });
                //console.log(t);
                cb(err, t);
            });
        }
    }, function(err, result) {
        if (err) {
            console.log('error occurred during buildSets: %s', err);
            return cb(err);
        }
        console.log('saving sets to redis');
        for (var key in result) {
            if (key === "trackedPlayers") {
                //add donators to set
                for (var key2 in result.donators) {
                    result.trackedPlayers[key2] = true;
                }
            }
            redis.set(key, JSON.stringify(result[key]));
        }
        console.log('set build complete');
        return cb(err);
    });
};