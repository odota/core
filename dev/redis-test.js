var r = require('./redis');
var redis = r.client;

console.log(redis.get("player:88367253"));
console.log(redis.ttl("player:88367253", function(err, res){
    console.log(err, res);
}));