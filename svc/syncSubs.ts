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
  const trx = await db.connect();
  await trx.query("BEGIN");
  try {
    // Delete all status from subscribers
    await trx.query("DELETE FROM subscriber");
    for (let sub of result) {
      const accountId = sub.metadata['account_id'];
      if (!accountId) {
        console.error('no accountID for active customer %s', sub.customer);
      } else {
        await trx.query(
          "INSERT INTO subscriber(account_id, customer_id, status) VALUES ($1, $2, 'active') ON CONFLICT DO NOTHING",
          [Number(accountId), sub.customer],
        );
      }
    }
    await trx.query("COMMIT");
  } catch (e) {
    await trx.query("ROLLBACK");
    throw e;
  } finally {
    trx.release();
  }
}, 60 * 1000);
