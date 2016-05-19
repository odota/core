/**
 * Interface to Cassandra client
 **/
var cass = require('cassandra-driver');
var config = require('../config');
var url = require('url');
var spl = config.CASSANDRA_URL.split(',');
var cps = spl.map(function(u)
{
    return url.parse(u).host;
});
console.error('connecting %s', config.CASSANDRA_URL);
var cassandra = new cass.Client(
{
    contactPoints: cps,
    keyspace: url.parse(spl[0]).path.substring(1),
});
module.exports = cassandra;