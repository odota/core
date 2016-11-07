/**
 * Interface to Cassandra client
 **/
const cass = require('cassandra-driver');
const config = require('../config');
const url = require('url');
const spl = config.CASSANDRA_URL.split(',');
const cps = spl.map(u =>
   url.parse(u).host
);
console.error('connecting %s', config.CASSANDRA_URL);
const cassandra = new cass.Client(
  {
    contactPoints: cps,
    keyspace: url.parse(spl[0]).path.substring(1),
  });
module.exports = cassandra;
