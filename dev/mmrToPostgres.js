const redis = require('../store/redis');
const db = require('../store/db');
const async = require('async');

redis.zrange('solo_competitive_rank', 0, -1, 'WITHSCORES', (err, ids) => {
  const inserts = [];
  for (let i = 0; i < ids.length; i += 2) {
    inserts.push({ account_id: ids[i], rating: ids[i + 1] });
  }
  async.each(inserts, (ins, cb) => {
    db.raw('INSERT INTO solo_competitive_rank(account_id, rating) VALUES (?, ?)', [ins.account_id, ins.rating]).asCallback(cb);
  });
});

redis.zrange('competitive_rank', 0, -1, 'WITHSCORES', (err, ids) => {
  const inserts = [];
  for (let i = 0; i < ids.length; i += 2) {
    inserts.push({ account_id: ids[i], rating: ids[i + 1] });
  }
  async.each(inserts, (ins, cb) => {
    db.raw('INSERT INTO competitive_rank(account_id, rating) VALUES (?, ?)', [ins.account_id, ins.rating]).asCallback(cb);
  });
});
