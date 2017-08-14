const async = require('async');
const redis = require('../store/redis');
const db = require('../store/db');
const utility = require('../util/utility');

db.transaction((trx) => {
  redis.keys('mmr_estimates:*', (err, keys) => {
    async.eachLimit(keys, 1000, (key, cb) => {
      console.log(key);
      redis.lrange(key, 0, -1, (err, result) => {
        const accountId = key.split(':')[1];
        const data = result
          .filter(d => d)
          .map(d => Number(d));
        const estimate = utility.average(data);
        if (accountId && estimate) {
          db.raw('INSERT INTO mmr_estimates VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET estimate = ?', [accountId, estimate, estimate]).asCallback(cb);
        } else {
          cb();
        }
      });
    }, (err) => {
      if (err) {
        return trx.rollback(err);
      }
      return trx.commit();
    });
  });
});
