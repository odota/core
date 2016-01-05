/*
var utility = require('../utility');
var queueReq = utility.queueReq;
var queue = require('../queue');
queueReq(queue, "fullhistory", {
    account_id: 64997477
}, {
    attempts: 1
}, function(err, job) {
    process.exit(Number(err));
});
var redis = require('./redis');
console.log(redis.get("player:88367253"));
console.log(redis.ttl("player:88367253", function(err, res) {
    console.log(err, res);
}));
*/
var cassandra = require('../cassandra');
cassandra.execute('SELECT TTL(cache) FROM player_caches WHERE account_id = ?', [88367253], function(err, res)
{
    console.log(res);
});