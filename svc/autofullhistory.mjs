import async from 'async';
import db from '../store/db.mjs';
import redis from '../store/redis.mjs';
function getSummaries(cb) {
  db.raw(
    "SELECT account_id from players TABLESAMPLE SYSTEM_ROWS(100) where last_match_time > (now() - interval '7 day')"
  ).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    console.log(result.rows);
    return async.each(
      result.rows,
      (row, cb) => {
        return redis.rpush(
          'fhQueue',
          JSON.stringify({
            account_id: row.account_id,
            short_history: true,
          }),
          cb
        );
      },
      cb
    );
  });
}
function start() {
  getSummaries((err) => {
    if (err) {
      throw err;
    }
    return setTimeout(start, 30000);
  });
}
start();
