/**
 * Create additional Redis clients for pubsub
 **/
var config = require('../config');
var redis = require('redis');

function createPubSub()
{
    return redis.createClient(config.REDIS_URL);
}
module.exports = createPubSub;