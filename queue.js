var kue = require('kue');
var config = require('./config');
var queue = kue.createQueue({
    redis: config.REDIS_URL
});
module.exports = queue;