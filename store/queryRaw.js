const config = require('../config');
module.exports = function queryRaw(input, cb)
{
  const knex = require('knex')(
    {
      client: 'pg',
      connection: config.READONLY_POSTGRES_URL,
      pool:
      {
        min: 1,
        max: 1,
      },
    });
  const sql = input.sql || translateNQL(input.q);
  const q = knex.raw(sql).timeout(60000);
  q.asCallback((err, result) => {
    knex.destroy(() => {
      cb(err, Object.assign(
      {}, input,
        {
          result,
          err: err ? err.stack : err,
        }));
    });
  });
};

function translateNQL(input)
{
  // TODO @nicholashh to implement this
  return '';
}
