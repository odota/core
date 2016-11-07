const db = require('../db');
const async = require('async');
const args = process.argv.slice(2);
const start_id = Number(args[0]) || 0;
const end_id = 2400000000;
const bucket = 10000000;
const starts = [];
for (let i = start_id; i < end_id; i += bucket) {
  starts.push(i);
}
async.eachSeries(starts, (s, cb) => {
  const q = db.raw('UPDATE player_matches SET account_id = NULL WHERE account_id = 4294967295 AND match_id >= ? AND match_id < ?; ', [s, s + bucket]);
  console.log(q.toString());
  q.asCallback((err, resp) => {
    console.log('%s %s', resp.command, resp.rowCount);
    cb(err);
  });
}, (err) => {
  if (err) {
    console.error(err);
  }
  process.exit(Number(err));
});
