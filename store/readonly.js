var knex = require('knex')(
{
    client: 'pg',
    connection: "readonly:readonly@localhost/yasp",
    pool:
    {
        min: 1,
        max: 5,
    },
});
module.exports = knex;