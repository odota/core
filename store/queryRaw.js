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
  const sql = input.sql || translateNQL(input.q);
  const q = conn.raw(sql).timeout(60000);
  q.asCallback((err, result) => {
    conn.destroy(() => {
      cb(err, Object.assign({}, input, {
        result,
        err: err ? err.stack : err,
      }));
    });
  });
};

function translateNQL(input) {
  // TODO @nicholashh to implement this
  return '';
}
