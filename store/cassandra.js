/**
 * Interface to Cassandra client
 * */
import { Client } from 'cassandra-driver';
import { parse } from 'url';
import config from '../config.js';

const spl = config.CASSANDRA_URL.split(',');
const cps = spl.map((u) => parse(u).host);
console.log('connecting %s', config.CASSANDRA_URL);
const cassandra = new Client({
  contactPoints: cps,
  localDataCenter: 'datacenter1',
  keyspace: parse(spl[0]).path.substring(1),
});
export default cassandra;
