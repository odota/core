const db = require('../store/db');
const async = require('async');
const request = require('request');

const host = 'localhost:5000';
function cb(err) {
  process.exit(Number(err));
}

db.select('account_id', 'last_login')
.from('players')
.whereNotNull('last_login')
.orderBy('last_login')
.orderBy('account_id')
.asCallback((err, results) => {
  if (err) {
    return cb(err);
  }
  return async.eachLimit(results, 10, (r, cb) => {
    console.time(r.account_id);
    request(`http://${host}/players/${r.account_id}`, (err) => {
      console.timeEnd(r.account_id);
      cb(err);
    });
  }, cb);
});

