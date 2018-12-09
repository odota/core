const redis = require('redis');
const { promisify } = require('util');
const request = require('request');
const JSONStream = require('JSONStream');
const config = require('../config');
const db = require('../store/db');
const queries = require('../store/queries');
const { redisCount } = require('../util/utility');

const redisClient = redis.createClient(config.REDIS_URL, {
  detect_buffers: true,
});
redisClient.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
const asyncXRead = promisify(redisClient.xread).bind(redisClient);
const asyncGet = promisify(redisClient.get).bind(redisClient);

function filterWebhook(webhook, match) {
  const { players = [], teams = [], leagues = [] } = webhook.subscriptions;
  const p = players.map(Number);
  const t = teams.map(Number);
  const l = leagues.map(Number);

  return (match.players.map(player => player.account_id).map(Number).some(id => p.includes(id)))
    || (t.includes(Number(match.radiant_team_id)))
    || (t.includes(Number(match.dire_team_id)))
    || (l.includes(Number(match.leagueid)));
}

const readFromFeed = async (seqNum) => {
  const result = await asyncXRead('block', '0', 'STREAMS', 'feed', seqNum);
  const hookStream = queries.getWebhooks(db).pipe(JSONStream.parse());

  hookStream.on('data', (webhook) => {
    result[0][1].forEach((dataArray) => {
      const match = JSON.parse(dataArray[1]['1']);
      if (filterWebhook(webhook, match)) {
        redisCount(redisClient, 'webhook');
        request
          .post(webhook.url, { json: true, body: match, timeout: config.WEBHOOK_TIMEOUT })
          .on('error', err => console.log(`${webhook.url} - ${err.code}`));
      }
    });
  });

  const l = result[0][1].length;
  const lastIndex = l ? result[0][1][l - 1][0] : '$';
  redisClient.set('webhooks:seqNum', lastIndex);
  setTimeout(() => readFromFeed(lastIndex), config.WEBHOOK_FEED_INTERVAL);
};

asyncGet('webhooks:seqNum')
  .then(seqNum => readFromFeed(seqNum))
  .catch((err) => {
    console.log(`${err.code} - Could not find webhooks sequence number, starting from top`);
    readFromFeed('$');
  });
