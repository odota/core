const JSONStream = require('JSONStream');
const async = require('async');
const db = require('../db');
const redis = require('../redis');
const queries = require('../queries');
const args = process.argv.slice(2);
const start_id = Number(args[0]) || 0;
const cassandra = require('../cassandra');
const stream = db.raw(`
SELECT account_id from players;
`, []).stream();
stream.on('end', exit);
stream.pipe(JSONStream.parse());
stream.on('data', (player) => {
  stream.pause();
  console.time(player.account_id);
  cassandra.execute('SELECT * from player_matches WHERE account_id = ?', [player.account_id], (err, result) => {
    if (err) {
      return exit(err);
    }
        // console.log(player.account_id, result.length);
    console.timeEnd(player.account_id);
    stream.resume();
  });
});

function exit(err) {
  if (err) {
    console.error(err);
  }
  process.exit(Number(err));
}
