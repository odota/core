var config = require('./config');
var db = require('knex')({
  client: 'pg',
  connection: config.POSTGRES_URL
});
module.exports = db;