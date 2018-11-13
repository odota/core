const redis = require('redis');
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

redisClient.on('message', (channel, message) => {
  const { match, origin } = message;

  queries.getWebhooks(db, (err, webhooks) => {
    if (webhooks) {
      parallel.async(webhooks
        .filter(filterWebhook)
        .map(webhook => () => {
          request.post(webhook.url, {
            json: true,
            body: {
              origin,
              match,
            },
          });
        }));
    }
  });
});

redisClient.subscribe('webhooks');
