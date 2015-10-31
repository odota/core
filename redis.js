var redis = require('redis');
var config = require('./config');
var client = redis.createClient(config.REDIS_URL, {
    detect_buffers: true
});
client.on('error', function(err) {
    throw err;
});
module.exports = client;
