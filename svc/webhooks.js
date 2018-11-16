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
  const subscriptions = JSON.parse(webhook.subscriptions);
  let matches = 0;
  match.players.forEach((player) => {
    if (subscriptions.player.indexOf(Number(player.account_id)) !== -1) {
      matches += 1;
    }
  });
  if (subscriptions.team.indexOf(Number(match.radiant_team_id)) !== -1) {
    matches += 1;
  }
  if (subscriptions.team.indexOf(Number(match.dire_team_id)) !== -1) {
    matches += 1;
  }
  if (subscriptions.league.indexOf(Number(match.leagueid)) !== -1) {
    matches += 1;
  }
  return matches > 0;
}

function callWebhook(webhook, match) {
  request.post(
    webhook.url,
    { json: true, body: match, timeout: 1000 },
  ).on('error', err => console.log(`${webhook.url} - ${err.code}`));
}

const readFromFeed = async () => {
  const result = await asyncXRead('block', '0', 'STREAMS', 'feed', '$');
  result[0][1].forEach(async (dataArray) => {
    const match = JSON.parse(dataArray[1]['1']);
    const webhooks = await queries.getWebhooks(db);
    if (webhooks) {
      const workers = webhooks
        .filter(filterWebhook)
        .map(webhook => (() => callWebhook(webhook, match)));
      parallel(workers);
    }
  });
  readFromFeed();
};
readFromFeed();
