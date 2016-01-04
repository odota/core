var bull = require('bull');
var config = require('./config');
var url = require('url');
// parse the url
var conn_info = url.parse(config.REDIS_URL, true /* parse query string */ );
if (conn_info.protocol !== 'redis:') {
    throw new Error('connection string must use the redis: protocol');
}
var options = {
    port: conn_info.port || 6379,
    host: conn_info.hostname,
    options: conn_info.query
};
if (conn_info.auth) {
    options.redis.auth = conn_info.auth.replace(/.*?:/, '');
}
module.exports = {
    parse: bull('parse', options.port, options.host),
    api: bull('api', options.port, options.host),
    request: bull('request', options.port, options.host),
    fullhistory: bull('fullhistory', options.port, options.host),
    mmr: bull('mmr', options.port, options.host),
    cache: bull('cache', options.port, options.host),
};