/**
 * Interface to PostgreSQL client
 **/
const config = require('../config');
const pg = require('pg');
pg.types.setTypeParser(20, (val) => {
  // remember: all values returned from the server are either NULL or a string
  return val === null ? null : parseInt(val, 10);
});
console.error('connecting %s', config.POSTGRES_URL);
const db = require('knex')(
  {
    client: 'pg',
    connection: config.POSTGRES_URL,
    pool:
    {
      max: 5,
    },
  });
module.exports = db;
