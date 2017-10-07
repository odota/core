/**
 * Interface to PostgreSQL client
 * */
const config = require('../config');
const pg = require('pg');
const knex = require('knex');

// remember: all values returned from the server are either NULL or a string
pg.types.setTypeParser(20, val => (val === null ? null : parseInt(val, 10)));
console.log('connecting %s', config.POSTGRES_URL);
const db = knex({
  client: 'pg',
  connection: config.POSTGRES_URL,
  pool:
    {
      max: 5,
    },
});
db.on('query-error', (err) => {
  throw err;
});
module.exports = db;
