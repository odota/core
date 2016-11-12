const config = require('../config');
const knex = require('knex');
module.exports = function queryRaw(input, cb) {
  const conn = knex({
    client: 'pg',
    // TODO make this work with tests
    connection: config.READONLY_POSTGRES_URL,
    pool: {
      min: 1,
      max: 1,
    },
  });
  const q = conn.raw(input).timeout(30000);
  q.asCallback((err, result) => {
    conn.destroy(() => {
      cb(err, result);
    });
  });
};
