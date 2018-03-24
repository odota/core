const async = require('async');
const redis = require('../store/redis');
const db = require('../store/db');
const utility = require('../util/utility');
const queries = require('../store/queries');

const { invokeInterval } = utility;

function storeUsageCounts(cursor, cb) {
  redis.hscan('usage_count', cursor, (err, results) => {
    if (err) {
      console.log('[ERROR] ', err);
      process.exit(1);
    }

    const cursor = results[0];
    const values = results[1];

    async.eachOfLimit(values, 5, (e, i, cb2) => {
      if (i % 2) {
        cb2();
      }

      if (e.startsWith('API')) {
        const split = e.split(':');

        db.from('api_keys').where({
          api_key: split[2],
        }).asCallback((err, results) => {
          if (err) {
            cb2(err);
          }
          if (results.length > 0) {
            db('api_key_usage')
              .insert({
                account_id: results[0].account_id,
                api_key: results[0].api_key,
                customer_id: results[0].customer_id,
                ip: split[1],
                usage_count: values[i + 1],
              })
              .asCallback(cb2);
          } else {
            cb2();
          }
        });
      } else if (e.startsWith('USER')) {
        const split = e.split(':');

        db('user_usage')
          .insert({
            ip: split[1],
            account_id: split[2] ? split[2] : null,
            usage_count: values[i + 1],
          })
          .asCallback(cb2);
      }
    }, (err) => {
      if (err) {
        console.error('[ERROR] ', err);
        process.exit(1);
      }

      storeUsageCounts(cursor, cb);
    });
  });
}


utility.invokeInterval((cb) => {
  queries.getAPIKeys(db, (err, rows) => {
    if (err) {
      cb();
    }

    if (rows.length > 0) {
      const keys = rows.map(e => e.api_key);

      redis.multi()
        .del('api_keys')
        .sadd('api_keys', keys)
        .exec((err, res) => {
          if (err) {
            console.error('[ERROR] ', err);
            process.exit(1);
          }
          console.log(res);
          cb();
        });
    } else {
      cb();
    }
  });
}, 5 * 60 * 1000); // Update every 5 min

invokeInterval(cb => storeUsageCounts(0, cb), 10 * 60 * 1000); // Every 10 minutes
