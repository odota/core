const JSONStream = require('JSONStream');
const async = require('async');
const db = require('../store/db');
const redis = require('../store/redis');
const args = process.argv.slice(2);
const start_id = Number(args[0]) || 0;
let conc = 0;
const stream = db.raw(`
SELECT pr.account_id, solo_competitive_rank from player_ratings pr
JOIN 
(select account_id, max(time) as maxtime from player_ratings GROUP by account_id) grouped
ON pr.account_id = grouped.account_id
AND pr.time = grouped.maxtime
WHERE pr.account_id > ?
AND solo_competitive_rank > 0
AND solo_competitive_rank IS NOT NULL
ORDER BY account_id asc
`, [start_id]).stream();
stream.on('end', exit);
stream.pipe(JSONStream.parse());
stream.on('data', (player) => {
  conc += 1;
  if (conc > 10) {
    stream.pause();
  }
  redis.zadd('solo_competitive_rank', player.solo_competitive_rank, player.account_id);
  console.log(player.account_id);
  conc -= 1;
  stream.resume();
});

function exit(err) {
  if (err) {
    console.error(err);
  }
  process.exit(Number(err));
}
