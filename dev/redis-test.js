var redis = require('./redis');
console.log(redis.get("player:88367253"));
console.log(redis.ttl("player:88367253", function(err, res) {
    console.log(err, res);
}));