const config = require('../config');
const redis = require('redis');
const request = require('request');
const parallel = require('async/parallel');
const db = require('../store/db');
const queries = require('../store/queries');

const redisClient = redis.createClient(config.REDIS_URL, {
  detect_buffers: true,
});
redisClient.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

function filterWebhook(webhook, match) {
  let matches = 0;
  match.players.forEach((player) => {
    if (webhook.subscriptions.player.indexOf(Number(player.account_id)) !== -1) {
      matches += 1;
    }
  });
  if (webhook.subscriptions.team.indexOf(Number(match.radiant_team_id)) !== -1) {
    matches += 1;
  }
  if (webhook.subscriptions.team.indexOf(Number(match.dire_team_id)) !== -1) {
    matches += 1;
  }
  if (webhook.subscriptions.league.indexOf(Number(match.leagueid)) !== -1) {
    matches += 1;
  }
  return matches > 0;
}

redisClient.on('message', (channel, message) => {
  const origin = channel.split(':')[2];
  message = JSON.parse(message);
  queries.getWebhooks(db, (err, webhooks) => {
    parallel.async(webhooks
      .filter(filterWebhook)
      .map(webhook => () => {
        request.post(webhook.url, {
          json: true,
          body: {
            origin,
            match: message,
          },
        });
    }));
  });
});

