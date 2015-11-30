var config = require('./config');
var pg = require('pg');
pg.types.setTypeParser(20, function(val)
{
  //remember: all values returned from the server are either NULL or a string
  return val === null ? null : parseInt(val, 10);
});
var db = require('knex')(
{
  client: 'pg',
  connection: config.POSTGRES_URL,
  pool:
  {
    min: 0,
    max: 2
  }
});
module.exports = db;
