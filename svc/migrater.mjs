import async from 'async';
import fs from 'fs';
import db from '../store/db.mjs';
import utility from '../util/utility.mjs';
const sqlQuery = fs.readFileSync('./sql/create_tables.sql', 'utf8');
// const cassQuery = fs.readFileSync('./sql/create_tables.cql', 'utf8');
const { invokeInterval } = utility;
function doMigrate(cb) {
  async.series(
    {
      sql: (cb) => db.raw(sqlQuery).asCallback(cb),
      /*
      cassandra: cb => async.eachSeries(cassQuery.split(';').filter(cql =>
        cql.length > 1), (cql, cb) => {
        cassandra.execute(cql, cb);
      }, cb),
      */
    },
    cb
  );
}
invokeInterval(doMigrate, 5 * 60 * 1000);
