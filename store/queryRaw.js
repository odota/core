const config = require('../config');
const knex = require('knex');
module.exports = function queryRaw(input, cb) {
  const conn = knex({
    client: 'pg',
    connection: config.READONLY_POSTGRES_URL,
    pool: {
      min: 1,
      max: 1,
    },
  });
  const q = conn.raw(input).timeout(30000);
  q.asCallback((err, result) => {
    conn.destroy(() => {
      cb(err, Object.assign({}, result, {
        err: err ? err.stack : err,
      }));
    });
  });
};
