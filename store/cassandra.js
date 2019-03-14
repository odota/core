/**
 * Interface to Cassandra client
 * */
const cassandraDriver = require('cassandra-driver');
const url = require('url');
const config = require('../config');

const spl = config.CASSANDRA_URL.split(',');
const cps = spl.map(u => url.parse(u).host);
console.log('connecting %s', config.CASSANDRA_URL);
const cassandra = new cassandraDriver.Client({
  contactPoints: cps,
  localDataCenter: 'datacenter1',
  keyspace: url.parse(spl[0]).path.substring(1),
});
module.exports = cassandra;
