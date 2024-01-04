import scyllaDriver from 'cassandra-driver';
import url from 'url';
import config from '../config';
const spl = config.SCYLLA_URL.split(',');
const cps: string[] = spl.map((u) => url.parse(u).host) as string[];
console.log('connecting %s', config.SCYLLA_URL);
const scylla = new scyllaDriver.Client({
  contactPoints: cps,
  localDataCenter: 'datacenter1',
  keyspace: url.parse(spl[0]).path?.substring(1),
});

const scyllaColumnInfo: Record<string, Record<string, boolean>> = {};
export async function getScyllaColumns(table: string) {
  if (!scyllaColumnInfo[table]) {
    const result = await scylla.execute(
      'SELECT column_name FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?',
      [config.NODE_ENV === 'test' ? 'yasp_test' : 'yasp', table],
    );
    scyllaColumnInfo[table] = {};
    result.rows.forEach((r) => {
      scyllaColumnInfo[table][r.column_name] = true;
    });
  }
  return scyllaColumnInfo[table];
}

export default scylla;
