var r = require('../redis');
var redis = r.client;

redis.get("trackedPlayers", function(err, result){
    result = JSON.parse(result);
    for (var key in result){
        redis.setex("visit:"+key, 60*60*24*7, key);
    }
});