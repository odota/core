const knex = require('knex');
const config = require('../config');

const conn = knex({
  client: 'pg',
  // TODO make this work with tests
  connection: config.READONLY_POSTGRES_URL,
  pool: {
    min: 1,
    max: 5,
  },
});

module.exports = conn;
