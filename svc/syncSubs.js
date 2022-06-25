/**
 * Function to sync subs between Stripe and DB
 * */
const db = require('../store/db');
const utility = require('../util/utility');
const stripe = require('stripe');
const { invokeInterval } = utility;

async function run(cb) {
    // Get list of current subscribers
    const result = [];
    for await (const sub of stripe.subscriptions.list({
      limit: 100,
      status: 'active',
    })) {
      result.push(sub);
    }
    await db.raw('BEGIN TRANSACTION');
    // Delete all status from subscribers
    await db.raw('UPDATE subscriber SET status = NULL');
    for (let i = 0; i < result.length; i++) {
        // Mark list of subscribers as active
        await db.raw(`INSERT INTO subscriber(account_id, customer_id, status) VALUES(?, ?, ?) ON CONFLICT(customer_id) DO UPDATE SET account_id=EXCLUDED.account_id, customer_id=EXCLUDED.customer_id`, [account_id, customer_id, sub.status]);
    }
    await db.raw('COMMIT');
}

invokeInterval(run, 60 * 1000);
 