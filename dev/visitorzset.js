var redis = require('../store/redis');
var db = require('../store/db');
var moment = require('moment');
db.select(['account_id', 'last_login']).from('players').whereNotNull('last_login').asCallback(function(err, docs)
{
    docs.forEach(function(player)
    {
        console.log(player);
        redis.zadd('visitors', moment(player.last_login).format('X'), player.account_id);
    });
    redis.keys("visit:*", function(err, result)
    {
        result.forEach(function(redis_key)
        {
            var account_id = redis_key.split(":")[1];
            redis.zadd('visitors', moment().format('X'), account_id);
        });
    });
});
