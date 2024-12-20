// Runs background processes related to API keys and billing/usage
import moment from 'moment';
import stripe from '../store/stripe';
import db from '../store/db';
import config from '../config';
import { invokeIntervalAsync } from '../util/utility';
import type Stripe from 'stripe';

async function updateStripeUsage() {
  const options = {
    plan: config.STRIPE_API_PLAN,
    limit: 100,
    // From the docs:
    // By default, returns a list of subscriptions that have not been canceled.
    // In order to list canceled subscriptions, specify status=canceled. Use all for completeness.
    status: 'all' as Stripe.Subscription.Status,
  };
  let num = 0;
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
    const startTime = moment.unix(sub.current_period_end - 1).startOf('month');
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
}
invokeIntervalAsync(updateStripeUsage, 5 * 60 * 1000); // Every 5 minutes
