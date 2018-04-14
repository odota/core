const async = require('async');
const redis = require('../store/redis');
const db = require('../store/db');
const utility = require('../util/utility');
const queries = require('../store/queries');
const config = require('../config');
const moment = require('moment');
const stripe = require('stripe')(config.STRIPE_SECRET);

const { invokeInterval } = utility;

function storeUsageCounts(cursor, cb) {
  console.log('[USAGE COUNT] Cursor:', cursor);
  redis.hscan('usage_count', cursor, (err, results) => {
    if (err) {
      cb(err);
    } else {
      const cursor = results[0];
      const values = results[1];

      const apiTimestamp = moment().startOf('day');
      const userTimestamp = moment().startOf('month');

      async.eachOfLimit(values, 5, (e, i, cb2) => {
        if (i % 2) {
          cb2();
        } else if (e.startsWith('API')) {
          const split = e.split(':');

          let apiRecord;
          db.from('api_keys').where({
            api_key: split[2],
          })
            .then((rows) => {
              if (rows.length > 0) {
                [apiRecord] = rows;

                return stripe.subscriptions.retrieve(apiRecord.subscription_id);
              }
              throw Error('No record found.');
            })
            .then(sub =>
              // Set usage to be the value at end of the billing period
              // - 1 so that it's within the same month
              // TODO(albert): We could break this out by day for the invoice
              // but we'd have to make changes to web.js and metrics
              stripe.usageRecords.create({
                quantity: Math.ceil(values[i + 1] / config.API_BILLING_UNIT),
                action: 'set',
                subscription_item: sub.items.data[0].id,
                timestamp: sub.current_period_end - 1,
              }))
            .then(() => db.raw(`
              INSERT INTO api_key_usage
              (account_id, api_key, customer_id, timestamp, ip, usage_count) VALUES
              (?, ?, ?, ?, ?, ?)
              ON CONFLICT ON CONSTRAINT api_key_usage_pkey DO UPDATE SET usage_count = ?
            `, [apiRecord.account_id, apiRecord.api_key, apiRecord.customer_id, apiTimestamp, split[1], values[i + 1], values[i + 1]]))
            .then(() => cb2())
            .catch((e) => {
              if (e.message === 'No record found.') {
                cb2();
              } else {
                cb2(e);
              }
            });
        } else if (e.startsWith('USER')) {
          const split = e.split(':');

          // null account_id mapped to 0 to avoid duplicate rows
          db.raw(`
            INSERT INTO user_usage
            (account_id, timestamp, ip, usage_count) VALUES
            (?, ?, ?, ?)
            ON CONFLICT (account_id, ip, timestamp) DO UPDATE SET usage_count = ?
          `, [split[2] || 0, userTimestamp, split[1], values[i + 1], values[i + 1]])
            .asCallback(cb2);
        }
      }, (err) => {
        if (err) {
          return cb(err);
        }

        if (cursor !== '0') {
          return storeUsageCounts(cursor, cb);
        }

        return cb();
      });
    }
  });
}

utility.invokeInterval((cb) => {
  queries.getAPIKeys(db, (err, rows) => {
    if (err) {
      cb(err);
    } else if (rows.length > 0) {
      const keys = rows.map(e => e.api_key);

      redis.multi()
        .del('api_keys')
        .sadd('api_keys', keys)
        .exec((err, res) => {
          if (err) {
            cb(err);
          }
          console.log('[API KEY CACHE] Got resposne:', res);
          cb();
        });
    } else {
      cb();
    }
  });
}, 5 * 60 * 1000); // Update every 5 min

invokeInterval(cb => storeUsageCounts(0, cb), 10 * 60 * 1000); // Every 10 minutes
