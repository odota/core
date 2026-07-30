// Syncs the list of subscribers from Stripe to the database
import db from "./store/db.ts";
import stripe from "./store/stripe.ts";
import { runInLoop } from "./store/queue.ts";

await runInLoop(async function doSyncSubs() {
  // Get list of current subscribers
  const result = [];
  for await (const sub of stripe.subscriptions.list({
    limit: 100,
    status: "active",
    price: "price_1LE5NqCHN72mG1oKg2Y9pqXb",
  })) {
    result.push(sub);
  }
  console.log(result.length, "subs");
  const trx = await db.transaction();
  try {
    // Delete all status from subscribers
    await trx.raw("UPDATE subscriber SET status = NULL");
    for (let sub of result) {
      // Reconcile, insert any missing subscribers
      const accountId = sub.metadata['account_id'];
      if (accountId) {
        await trx.raw("INSERT INTO subscriber(account_id, customer_id, status) VALUES (?, ?, 'active') ON CONFLICT DO NOTHING", [Number(accountId), sub.customer]);
      }
      // Mark subscribers as active
      await trx.raw("UPDATE subscriber SET status = 'active' WHERE customer_id = ?", [
        sub.customer,
      ]);
    }
    await trx.commit();
  } catch (e) {
    await trx.rollback();
    throw e;
  }
}, 60 * 1000);
