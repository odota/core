import { eachOfLimit } from 'async';
import moment, { unix } from 'moment';
import stripeLib from 'stripe';
import redis from '../store/redis.js';
import db, { from, raw } from '../store/db.js';
import utility from '../util/utility.js';
import { getAPIKeys } from '../store/queries.js';
import { STRIPE_SECRET, ENABLE_API_LIMIT, STRIPE_API_PLAN, API_BILLING_UNIT } from '../config.js';

const stripe = stripeLib(STRIPE_SECRET);
const { invokeInterval } = utility;

function storeUsageCounts(cursor, cb) {
  redis.hscan('usage_count', cursor, (err, results) => {
    if (err) {
      cb(err);
    } else {
      const cursor = results[0];
      const values = results[1];

      const apiTimestamp = moment().startOf('day');

      eachOfLimit(
        values,
        5,
        (e, i, cb2) => {
          if (i % 2) {
            cb2();
          } else if (e.includes(':')) {
            cb2();
          } else if (ENABLE_API_LIMIT) {
            const split = e;
            // console.log("Updating usage for", e, "usage", values[i + 1]);
            let apiRecord;
            from('api_keys')
              .where({
                api_key: split,
              })
              .then((rows) => {
                if (rows.length > 0) {
                  [apiRecord] = rows;
                  return raw(
                    `
                  INSERT INTO api_key_usage
                  (account_id, api_key, customer_id, timestamp, ip, usage_count) VALUES
                  (?, ?, ?, ?, ?, ?)
                  ON CONFLICT ON CONSTRAINT api_key_usage_pkey DO UPDATE SET usage_count = ?
                `,
                    [
                      apiRecord.account_id,
                      apiRecord.api_key,
                      apiRecord.customer_id,
                      apiTimestamp,
                      '',
                      values[i + 1],
                      values[i + 1],
                    ]
                  );
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
        },
        (err) => {
          if (err) {
            return cb(err);
          }

          if (cursor !== '0') {
            return storeUsageCounts(cursor, cb);
          }

          return cb();
        }
      );
    }
  });
}

async function updateStripeUsage(cb) {
  const options = {
    plan: STRIPE_API_PLAN,
    limit: 100,
    // From the docs:
    // By default, returns a list of subscriptions that have not been canceled.
    // In order to list canceled subscriptions, specify status=canceled. Use all for completeness.
    status: 'all',
  };
  let num = 0;
  try {
    // https://stripe.com/docs/api/pagination/auto so we don't need to worry about cursors
    for await (const sub of stripe.subscriptions.list(options)) {
      num++;
      // Deactivate any keys which failed to bill
      // updateAPIKeysInRedis deletes the keys so just do that there
      if (sub.status === 'canceled') {
        console.log('updateStripeUsage CANCELED SUBSCRIPTION', sub.id);
        await raw(
          `
                  UPDATE api_keys SET is_canceled = true WHERE subscription_id = ?
                `,
          [sub.id]
        );

        continue;
      }

      const startTime = unix(sub.current_period_end - 1)
        .startOf('month');
      const endTime = unix(sub.current_period_end - 1).endOf('month');

      const res = await raw(
        `
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
              `,
        [startTime.format('YYYY-MM-DD'), endTime.format('YYYY-MM-DD'), sub.id]
      );

      if (res.rows.length > 0 && res.rows[0].usage_count) {
        const usageCount = res.rows[0].usage_count;
        // Set usage to be the value at end of the billing period
        // - 1 so that it's within the same month
        // TODO(albert): We could break this out by day for the invoice
        // but we'd have to make changes to web.js and metrics
        await stripe.subscriptionItems.createUsageRecord(sub.items.data[0].id, {
          quantity: Math.ceil(usageCount / API_BILLING_UNIT),
          action: 'set',
          timestamp: sub.current_period_end - 1,
        });
        console.log(
          'updateStripeUsage updated',
          sub.id,
          usageCount,
          Math.ceil(usageCount / API_BILLING_UNIT)
        );
      } else {
        // console.log(`updateStripeUsage No usage for ${sub.id}`);
      }
    }
    console.log(`updateStripeUsage processed ${num} records`);
    cb();
  } catch (err) {
    console.error(err);
    cb(err);
  }
}

invokeInterval(
  (cb) => {
    getAPIKeys(db, (err, rows) => {
      if (err) {
        cb(err);
      } else if (rows.length > 0) {
        const keys = rows.map((e) => e.api_key);
        console.log('getApikeys', rows.length, keys);
        redis
          .multi()
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
  },
  5 * 60 * 1000
); // Update every 5 min

invokeInterval(
  (cb) => {
    storeUsageCounts(0, cb);
  },
  10 * 60 * 1000
); // Every 10 minutes
invokeInterval(updateStripeUsage, 5 * 60 * 1000); // Every 5 minutes
