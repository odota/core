const redis = require('../store/redis');
const db = require('../store/db');
const moment = require('moment');
db.select(['account_id', 'last_login']).from('players').whereNotNull('last_login').asCallback((err, docs) => {
  docs.forEach((player) => {
    console.log(player);
    redis.zadd('visitors', moment(player.last_login).format('X'), player.account_id);
  });
  redis.keys('visit:*', (err, result) => {
    result.forEach((redis_key) => {
      const account_id = redis_key.split(':')[1];
      redis.zadd('visitors', moment().format('X'), account_id);
    });
  });
});
