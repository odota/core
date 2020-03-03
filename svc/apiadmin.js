const async = require('async');
const moment = require('moment');
const stripeLib = require('stripe');
const redis = require('../store/redis');
const db = require('../store/db');
const utility = require('../util/utility');
const queries = require('../store/queries');
const config = require('../config');

const stripe = stripeLib(config.STRIPE_SECRET);
const { invokeInterval } = utility;

function storeUsageCounts(cursor, cb) {
  redis.hscan('usage_count', cursor, (err, results) => {
    if (err) {
      cb(err);
    } else {
      const cursor = results[0];
      const values = results[1];

      const apiTimestamp = moment().startOf('day');

      async.eachOfLimit(values, 5, (e, i, cb2) => {
        if (i % 2) {
          cb2();
        } else if (e.includes(':')) {
          cb2();
        } else if (config.ENABLE_API_LIMIT) {
          const split = e;
          console.log('Updating usage for', e, 'usage', values[i + 1]);
          let apiRecord;
          db.from('api_keys').where({
            api_key: split,
          })
            .then((rows) => {
              if (rows.length > 0) {
                [apiRecord] = rows;
                return db.raw(`
                  INSERT INTO api_key_usage
                  (account_id, api_key, customer_id, timestamp, ip, usage_count) VALUES
                  (?, ?, ?, ?, ?, ?)
                  ON CONFLICT ON CONSTRAINT api_key_usage_pkey DO UPDATE SET usage_count = ?
                `, [apiRecord.account_id, apiRecord.api_key, apiRecord.customer_id, apiTimestamp, '', values[i + 1], values[i + 1]]);
              }
              throw Error('No record found.');
            })
            .then(() => cb2())
            .catch((e) => {
              if (e.message === 'No record found.') {
                cb2();
              } else {
                cb2(e);
              }
            });
        } else {
          cb2();
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

function updateStripeUsage(cursor, cb) {
  const options = {
    plan: config.STRIPE_API_PLAN,
    limit: 100,
  };

  if (cursor) {
    options.starting_after = cursor;
  }

  stripe.subscriptions.list(options)
    .then((list) => {
      const { data } = list;
      async.eachLimit(data, 5, (e, cb2) => {
        const startTime = moment.unix(e.current_period_end - 1).startOf('month');
        const endTime = moment.unix(e.current_period_end - 1).endOf('month');
        db.raw(`
          SELECT
            SUM(usage) as usage_count
          FROM (
            SELECT
              api_key_usage.api_key,
              api_key_usage.ip,
              MAX(api_key_usage.usage_count) as usage
            FROM api_key_usage, api_keys
            WHERE
              api_key_usage.account_id = api_keys.account_id
              AND timestamp >= ?
              AND timestamp <= ?
              AND subscription_id = ?
            GROUP BY api_key_usage.api_key, api_key_usage.ip
          ) as t1
        `, [startTime.format('YYYY-MM-DD'), endTime.format('YYYY-MM-DD'), e.id])
          .asCallback((err, res) => {
            if (err) {
              cb2(err);
            } else if (res.rows.length > 0 && res.rows[0].usage_count) {
              const usageCount = res.rows[0].usage_count;
              // Set usage to be the value at end of the billing period
              // - 1 so that it's within the same month
              // TODO(albert): We could break this out by day for the invoice
              // but we'd have to make changes to web.js and metrics
              stripe.usageRecords.create({
                quantity: Math.ceil(usageCount / config.API_BILLING_UNIT),
                action: 'set',
                subscription_item: e.items.data[0].id,
                timestamp: e.current_period_end - 1,
              })
                .then(() => console.log('[STRIPE] updated', e.id, usageCount))
                .then(cb2)
                .catch(cb2);
            } else {
              console.log(`No usage for ${e.id}`);
              cb2();
            }
          });
      }, (err) => {
        if (err) {
          cb(err);
        } else if (list.has_more) {
          updateStripeUsage(data[data.length - 1].id, cb);
        } else {
          cb();
        }
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
invokeInterval(cb => updateStripeUsage(0, cb), 5 * 60 * 1000); // Every 5 minutes
