// Syncs the list of subscribers from Stripe to the database
import db from '../store/db.mts';
import config from '../config.js';
import stripeLib from 'stripe';
import { invokeInterval } from '../util/utility.mts';

//@ts-ignore
const stripe = stripeLib(config.STRIPE_SECRET);
async function run(cb: ErrorCb) {
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
  cb();
}
invokeInterval(run, 60 * 1000);
