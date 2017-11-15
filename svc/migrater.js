const async = require('async');
const fs = require('fs');
const db = require('../store/db');
const cassandra = require('../store/cassandra');
const utility = require('../util/utility');

const sqlQuery = fs.readFileSync('./sql/create_tables.sql', 'utf8');
const cassQuery = fs.readFileSync('./sql/create_tables.cql', 'utf8');
const invokeInterval = utility.invokeInterval;

function doMigrate(cb) {
  async.series({
    sql: cb => db.raw(sqlQuery).asCallback(cb),
    cassandra: cb => async.eachSeries(cassQuery.split(';').filter(cql =>
      cql.length > 1), (cql, cb) => {
      cassandra.execute(cql, (err) => {
        if (err) {
        // Ignore Cassandra errors since it doesn't have ALTER TABLE IF NOT EXISTS
          console.log(err);
        }
        cb();
      });
    }, cb),
  }, cb);
}
invokeInterval(doMigrate, 5 * 60 * 1000);
