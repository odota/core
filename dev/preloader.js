const JSONStream = require('JSONStream');
const config = require('../config');
const constants = require('dotaconstants');
const db = require('../db');
const request = require('request');
const args = process.argv.slice(2);
const limit = Number(args[1]) || 100000;
let conc = 0;
const stream = db.raw(`
SELECT account_id, match_id
FROM player_matches
ORDER BY match_id DESC
LIMIT ?;
`, [limit]).stream();
stream.on('end', exit);
stream.pipe(JSONStream.parse());
stream.on('data', (player) => {
  if (!player.account_id || player.account_id === constants.anonymous_account_id)
    {
    return;
  }
  conc += 1;
  if (conc > 5)
    {
    stream.pause();
  }
  request(config.ROOT_URL + '/api/players/' + player.account_id, (err, resp, body) => {
    if (err || resp.statusCode !== 200)
        {
      console.error('error: %s', err || resp.statusCode);
    }
    console.log(player.account_id);
    setTimeout(() => {
      stream.resume();
    }, 2000);
  });
});

function exit(err)
{
  if (err)
    {
    console.error(err);
  }
  process.exit(Number(err));
}
