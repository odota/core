/**
 * Interface to PostgreSQL client
 **/
var config = require('../config');
var pg = require('pg');
pg.types.setTypeParser(20, function(val)
{
  //remember: all values returned from the server are either NULL or a string
  return val === null ? null : parseInt(val, 10);
});
console.error('connecting %s', config.POSTGRES_URL);
var db = require('knex')(
{
  client: 'pg',
  connection: config.POSTGRES_URL,
  pool:
  {
    max: 5,
  },
});
module.exports = db;
