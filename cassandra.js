var cass = require('cassandra-driver');
var config = require('./config');
var split = config.CASSANDRA_URL.split('/');
var cassandra = new cass.Client(
{
    contactPoints: [split[0]],
    keyspace: split[1]
});
module.exports = cassandra;