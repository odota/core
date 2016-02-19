var db = require('knex')(
{
    client: 'pg',
    connection: 'postgres://postgres:postgres@core-1/yasp'
});
db.client.pool.on('error', function(err)
{
    throw err;
});
db.raw('select version();').asCallback(function(err, rows)
{
    console.log(rows);
    process.exit(Number(err));
});
module.exports = db;
