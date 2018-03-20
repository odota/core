const async = require('async');
const redis = require('../store/redis');
const db = require('../store/db');

function storeUsageCounts(cursor) {
  redis.scan(cursor, 'MATCH', 'api_count_limit:*', (err, results) => {
    if (err) {
      console.log('[ERROR] ', err);
      process.exit(1);
    }

    const cursor = results[0];

    async.parallel(
      {
        usage: cb => async.mapLimit(results[1], 20, (e, cb2) => redis.get(e, cb2), cb),
        keyInfo: cb => async.mapLimit(results[1], 20, (e, cb2) => {
          db.from('api_keys').where({
            api_key: e.replace('api_count_limit:', ''),
          }).asCallback(cb2);
        }, cb),
      },
      (err, results) => {
        if (err) {
          console.error('[ERROR] ', err);
          process.exit(1);
        }

        db('api_key_usage')
          .insert(results.keyInfo.map((e, i) => ({
            account_id: e[0].account_id,
            api_key: e[0].api_key,
            customer_id: e[0].customer_id,
            usage_count: results.usage[i],
          })))
          .asCallback((err) => {
            if (err) {
              console.error('[ERROR] ', err);
              process.exit(1);
            }

            if (cursor !== '0') {
              storeUsageCounts(cursor);
            }
          });
      },
    );
  });
}

setInterval(() => storeUsageCounts(0), 10 * 60 * 1000); // Every 10 minutes
