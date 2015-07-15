var redis = require('redis');
var parseRedisUrl = require('parse-redis-url')(redis);
var config = require('./config');
var options = parseRedisUrl.parse(config.REDIS_URL);
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