import cassandraDriver from 'cassandra-driver';
import url from 'url';
import config from '../config';
const spl = config.CASSANDRA_URL.split(',');
const cps: string[] = spl.map((u) => url.parse(u).host) as string[];
console.log('connecting %s', config.CASSANDRA_URL);
export const cassandra = new cassandraDriver.Client({
  contactPoints: cps,
  localDataCenter: 'datacenter1',
  keyspace: url.parse(spl[0]).path?.substring(1),
});
export default cassandra;
