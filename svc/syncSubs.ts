// Syncs the list of subscribers from Stripe to the database
import db from './store/db.ts';
import stripe from './store/stripe.ts';
import { runInLoop } from './util/utility.ts';

runInLoop(async function doSyncSubs() {
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
  const trx = await db.transaction();
  // Delete all status from subscribers
  await trx.raw('UPDATE subscriber SET status = NULL');
  for (let sub of result) {
    // Mark list of subscribers as active
    await trx.raw('UPDATE subscriber SET status = ? WHERE customer_id = ?', [
      sub.status,
      sub.customer,
    ]);
  }
  await trx.commit();
}, 60 * 1000);
