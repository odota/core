/**
 * Interface to Scylla client
 * */
const cassandraDriver = require('cassandra-driver');
const url = require('url');
const config = require('../config');

let scylla = null;
if (config.SCYLLA_URL) {
  const spl = config.SCYLLA_URL.split(',');
  const cps = spl.map(u => url.parse(u).host);
  console.log('connecting %s', config.SCYLLA_URL);
  scylla = new cassandraDriver.Client({
    contactPoints: cps,
    localDataCenter: 'datacenter1',
    keyspace: url.parse(spl[0]).path.substring(1),
  });
}
module.exports = scylla;
