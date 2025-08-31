import { types } from 'pg';
import knex from 'knex';
import config from '../../config.ts';
// remember: all values returned from the server are either NULL or a string
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
console.log('connecting %s', config.POSTGRES_URL);
export const db = knex({
  client: 'pg',
  connection: config.POSTGRES_URL,
  pool: {
    min: 0,
    max: 10,
    // afterCreate: (conn, done) => {
    //   // Set the minimum similarity for pg_trgm
    //   conn.query('SELECT set_limit(0.6);', (err) => {
    //     // if err is not falsy, connection is discarded from pool
    //     done(err, conn);
    //   });
    // },
  },
});

const columnInfo: Record<string, any> = {};
export async function getPostgresColumns(table: string) {
  if (!columnInfo[table]) {
    const result = await db(table).columnInfo();
    columnInfo[table] = result;
  }
  return columnInfo[table];
}

export default db;
