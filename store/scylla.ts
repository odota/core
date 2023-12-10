import scyllaDriver from 'cassandra-driver';
import url from 'url';
import config from '../config.js';
const spl = config.SCYLLA_URL.split(',');
const cps: string[] = spl.map((u) => url.parse(u).host) as string[];
console.log('connecting %s', config.SCYLLA_URL);
const scylla = new scyllaDriver.Client({
  contactPoints: cps,
  localDataCenter: 'datacenter1',
  keyspace: url.parse(spl[0]).path?.substring(1),
});
export default scylla;
