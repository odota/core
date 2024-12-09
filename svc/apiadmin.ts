// Runs background processes related to API keys and billing/usage
import moment from 'moment';
import stripe from '../store/stripe';
import redis from '../store/redis';
import db from '../store/db';
import config from '../config';
import type { knex } from 'knex';
import { invokeInterval, invokeIntervalAsync } from '../util/utility';
import type Stripe from 'stripe';

// NOTE: cannot currently delete and rebuild redis data because API usage counts for the month will be lost
// probably can alleviate by storing usage per day and then summing it here, or by writing usage to pg directly
async function storeUsageCounts() {
  try {
    let cursor = null;
    while (cursor !== '0') {
      let [nextCursor, values] = await redis.hscan('usage_count', cursor ?? '0');
      cursor = nextCursor as string;
      const apiTimestamp = moment().startOf('day');
      for (let i = 0; i < values.length; i++) {
        const e = values[i];
        if (Number(i) % 2) {
          continue;
        } else if (e.includes(':')) {
          continue;
        } else if (config.ENABLE_API_LIMIT) {
          const split = e;
          // console.log("Updating usage for", e, "usage", values[i + 1]);
          const rows = await db.from('api_keys')
            .where({
              api_key: split,
            });
          const apiRecord = rows[0];
          if (apiRecord) {
            await db.raw(`
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
                values?.[Number(i) + 1],
                values?.[Number(i) + 1],
              ],
            );
          }
        }
      }
    }
  } catch (e) {
    // Log errors here but don't throw to avoid interfering with other jobs
    console.error(e);
  }
}
async function updateStripeUsage(cb: ErrorCb) {
  const options = {
    plan: config.STRIPE_API_PLAN,
    limit: 100,
    // From the docs:
    // By default, returns a list of subscriptions that have not been canceled.
    // In order to list canceled subscriptions, specify status=canceled. Use all for completeness.
    status: 'all' as Stripe.Subscription.Status,
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
        await db.raw(
          `
                  UPDATE api_keys SET is_canceled = true WHERE subscription_id = ?
                `,
          [sub.id],
        );
        continue;
      }
      const startTime = moment
        .unix(sub.current_period_end - 1)
        .startOf('month');
      const endTime = moment.unix(sub.current_period_end - 1).endOf('month');
      const res = await db.raw(
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
        [startTime.format('YYYY-MM-DD'), endTime.format('YYYY-MM-DD'), sub.id],
      );
      if (res.rows.length > 0 && res.rows[0].usage_count) {
        const usageCount = res.rows[0].usage_count;
        // Set usage to be the value at end of the billing period
        // - 1 so that it's within the same month
        // TODO(albert): We could break this out by day for the invoice
        // but we'd have to make changes to web.js and metrics
        await stripe.subscriptionItems.createUsageRecord(sub.items.data[0].id, {
          quantity: Math.ceil(usageCount / Number(config.API_BILLING_UNIT)),
          action: 'set',
          timestamp: sub.current_period_end - 1,
        });
        console.log(
          'updateStripeUsage updated',
          sub.id,
          usageCount,
          Math.ceil(usageCount / Number(config.API_BILLING_UNIT)),
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
function getAPIKeys(db: knex.Knex, cb: ErrorCb) {
  db.raw(
    `
    SELECT api_key FROM api_keys WHERE api_key IS NOT NULL AND is_canceled IS NOT TRUE
    `,
  ).asCallback((err: any, result: any) => {
    if (err) {
      return cb(err);
    }
    return cb(err, result.rows);
  });
}
invokeInterval(
  (cb: ErrorCb) => {
    getAPIKeys(db, (err: any, rows: any[]) => {
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
              return cb(err);
            }
            console.log('[API KEY CACHE] Got response:', res);
            cb();
          });
      } else {
        cb();
      }
    });
  },
  5 * 60 * 1000,
);
invokeIntervalAsync(
  storeUsageCounts,
  10 * 60 * 1000,
);
invokeInterval(updateStripeUsage, 5 * 60 * 1000);
