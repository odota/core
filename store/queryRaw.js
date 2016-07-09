module.exports = function queryRaw(input, cb)
{
  var knex = require('knex')(
  {
    client: 'pg',
    connection: "readonly:readonly@localhost/yasp",
    pool:
    {
      min: 1,
      max: 1,
    },
  });
  var sql = input.sql || translateNQL(input.q);
  var q = knex.raw(sql).timeout(60000);
  q.asCallback(function (err, result)
  {
    knex.destroy(function ()
    {
      cb(err, Object.assign(
      {}, input,
      {
        result: result,
        err: err ? err.stack : err,
      }));
    });
  });
};

function translateNQL(input)
{
  //TODO @nicholashh to implement this
  return "";
}