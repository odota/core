import cassandraDriver from 'cassandra-driver';
import url from 'url';
import config from '../../config.ts';
const spl = config.CASSANDRA_URL.split(',');
const cps: string[] = spl.map((u) => url.parse(u).host) as string[];
console.log('connecting %s', config.CASSANDRA_URL);
export const cassandra = new cassandraDriver.Client({
  contactPoints: cps,
  localDataCenter: 'datacenter1',
  keyspace: url.parse(spl[0]).path?.substring(1),
});

const cassandraColumnInfo: Record<string, Record<string, boolean>> = {};
export async function getCassandraColumns(table: string) {
  if (!cassandraColumnInfo[table]) {
    const result = await cassandra.execute(
      'SELECT column_name FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?',
      [config.NODE_ENV === 'test' ? 'yasp_test' : 'yasp', table],
    );
    cassandraColumnInfo[table] = {};
    result.rows.forEach((r) => {
      cassandraColumnInfo[table][r.column_name] = true;
    });
  }
  return cassandraColumnInfo[table];
}

export default cassandra;
