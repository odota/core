var redis = require('redis'),
    parseRedisUrl = require('parse-redis-url')(redis);
var options = parseRedisUrl.parse(process.env.REDIS_URL || "redis://127.0.0.1:6379/0");
//set keys for kue
options.auth = options.password;
options.db = options.database;
var kue = require('kue');
var client = redis.createClient(options.port, options.host, {
    auth_pass: options.password
});
var jobs = kue.createQueue({
    redis: options
});

module.exports = {
    client: client,
    kue: kue,
    jobs: jobs
};