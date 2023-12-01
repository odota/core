/**
 * Worker to auto-queue full history requests for random players
 * */
import { each } from 'async';
import { raw } from '../store/db.js';
import { rpush } from '../store/redis.js';

function getSummaries(cb) {
  raw(
    "SELECT account_id from players TABLESAMPLE SYSTEM_ROWS(100) where last_match_time > (now() - interval '7 day')"
  ).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    console.log(result.rows);
    return each(
      result.rows,
      (row, cb) => {
        return rpush(
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
