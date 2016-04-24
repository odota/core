var cass = require('cassandra-driver');
var config = require('./config');
var url = require('url');
var u = url.parse(config.CASSANDRA_URL);
console.error('connecting %s', config.CASSANDRA_URL);
var cassandra = new cass.Client(
{
    contactPoints: [u.host],
    keyspace: u.path.substring(1)
});
module.exports = cassandra;