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
        } else if (config.ENABLE_API_LIMIT && e.startsWith('API')) {
          const split = e.split(':');
          if (split.length !== 3) {
            cb2();
          } else {
            console.log('Updating usage for', e, 'usage', values[i + 1]);
            let apiRecord;
            db.from('api_keys').where({
              api_key: split[2],
            })
              .then((rows) => {
                if (rows.length > 0) {
                  [apiRecord] = rows;
                  return db.raw(`
                    INSERT INTO api_key_usage
                    (account_id, api_key, customer_id, timestamp, ip, usage_count) VALUES
                    (?, ?, ?, ?, ?, ?)
                    ON CONFLICT ON CONSTRAINT api_key_usage_pkey DO UPDATE SET usage_count = ?
                  `, [apiRecord.account_id, apiRecord.api_key, apiRecord.customer_id, apiTimestamp, split[1], values[i + 1], values[i + 1]]);
                }
                throw Error('No record found');
              })
              .then(() => cb2())
              .catch((e) => {
                if (e.message === 'No record found.') {
                  cb2();
                } else {
                  cb2(e);
                }
              });
          }
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

function updateStripeUsage(cb) {
  const startTime = moment().startOf('month').format('YYYY-MM-DD');
  const endTime = moment().endOf('month').format('YYYY-MM-DD');
  db.raw(`
    SELECT
      api_key_usage.account_id,
      subscription_id,
      ARRAY_AGG(api_key_usage.api_key) as keys,
      ARRAY_AGG(DISTINCT ip) as ips,
      SUM(usage_count) as usage_count
    FROM api_key_usage, api_keys
    WHERE
      api_key_usage.account_id = api_keys.account_id
      AND timestamp = (
        SELECT
          MAX(timestamp)
        FROM api_key_usage
        WHERE timestamp >= ?
        AND timestamp <= ?)
    GROUP BY
      api_key_usage.account_id,
      subscription_id
  `, [startTime, endTime])
    .then((res) => {
      async.eachLimit(res.rows, 5, (e, cb2) => {
        stripe.subscriptions.retrieve(e.subscription_id)
          .then(sub =>
          // Set usage to be the value at end of the billing period
          // - 1 so that it's within the same month
          // TODO(albert): We could break this out by day for the invoice
          // but we'd have to make changes to web.js and metrics
            stripe.usageRecords.create({
              quantity: Math.ceil(e.usage_count / config.API_BILLING_UNIT),
              action: 'set',
              subscription_item: sub.items.data[0].id,
              timestamp: sub.current_period_end - 1,
            }))
          .then(() => console.log('[STRIPE] updated ', e.subscription_id, e.usage_count))
          .then(cb2)
          .catch(err => cb2(err));
      }, (err) => {
        cb(err);
      });
    })
    .catch(err => console.log(err));
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
          console.log('[API KEY CACHE] Got response:', res);
          cb();
        });
    } else {
      cb();
    }
  });
}, 5 * 60 * 1000); // Update every 5 min

invokeInterval(cb => storeUsageCounts(0, cb), 10 * 60 * 1000); // Every 10 minutes
invokeInterval(cb => updateStripeUsage(cb), 5 * 60 * 1000); // Every 5 minutes
