import db from '../store/db.mjs';
import utility from '../util/utility.js';
import config from '../config.js';
import stripeLib from 'stripe';
const stripe = stripeLib(config.STRIPE_SECRET);
const { invokeInterval } = utility;
async function run(cb) {
  // Get list of current subscribers
  const result = [];
  for await (const sub of stripe.subscriptions.list({
    limit: 100,
    status: 'active',
    price: 'price_1LE5NqCHN72mG1oKg2Y9pqXb',
  })) {
    result.push(sub);
  }
  console.log(result.length, 'subs');
  await db.raw('BEGIN TRANSACTION');
  // Delete all status from subscribers
  await db.raw('UPDATE subscriber SET status = NULL');
  for (let i = 0; i < result.length; i++) {
    const sub = result[i];
    // Mark list of subscribers as active
    await db.raw('UPDATE subscriber SET status = ? WHERE customer_id = ?', [
      sub.status,
      sub.customer,
    ]);
  }
  await db.raw('COMMIT');
}
invokeInterval(run, 60 * 1000);
