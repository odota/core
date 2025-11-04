import pg from 'pg';
import knex from 'knex';
import config from '../../config.ts';
// remember: all values returned from the server are either NULL or a string
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
console.log('connecting %s with %s max connections', config.POSTGRES_URL, config.POSTGRES_MAX_CONNECTIONS);
export const db = knex({
  client: 'pg',
  connection: config.POSTGRES_URL,
  pool: {
    min: 0,
    max: 100,
    // afterCreate: (conn, done) => {
    //   // Set the minimum similarity for pg_trgm
    //   conn.query('SELECT set_limit(0.6);', (err) => {
    //     // if err is not falsy, connection is discarded from pool
    //     done(err, conn);
    //   });
    // },
  },
});

export default db;
