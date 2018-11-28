const redis = require('redis');
const { promisify } = require('util');
const request = require('request');
const parallel = require('async/parallel');
const config = require('../config');
const db = require('../store/db');
const queries = require('../store/queries');

const redisClient = redis.createClient(config.REDIS_URL, {
  detect_buffers: true,
});
redisClient.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
const asyncXRead = promisify(redisClient.xread).bind(redisClient);

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

function callWebhook(webhook, match) {
  request
    .post(webhook.url, { json: true, body: match, timeout: config.WEBHOOK_TIMEOUT })
    .on('error', err => console.log(`${webhook.url} - ${err.code}`));
}

const readFromFeed = async () => {
  const result = await asyncXRead('block', '0', 'STREAMS', 'feed', '$');
  result[0][1].forEach(async (dataArray) => {
    const match = JSON.parse(dataArray[1]['1']);
    const webhooks = await queries.getWebhooks(db);
    if (webhooks) {
      const workers = webhooks
        .filter(webhook => filterWebhook(webhook, match))
        .map(webhook => (() => callWebhook(webhook, match)));
      parallel(workers);
    }
  });
  readFromFeed();
};
readFromFeed();
