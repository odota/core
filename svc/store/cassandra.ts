import cassandraDriver from 'cassandra-driver';
import config from '../../config.ts';

const spl = config.CASSANDRA_URL.split(',');
const cps = spl.map((u) => new URL(u).host);
console.log('[CASSANDRA] connecting %s', config.CASSANDRA_URL);
export const cassandra = new cassandraDriver.Client({
  contactPoints: cps,
  localDataCenter: 'datacenter1',
  keyspace: new URL(spl[0]).pathname.substring(1),
});

setInterval(() => {
  const hosts = cassandra.getState().getConnectedHosts().filter(h => h.isUp());
  if (!hosts.length) {
    // Restart the process
    console.log('[CASSANDRA] no hosts connected, restarting');
    process.exit(1);
  }
}, 60000);

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
