/**
 * Function to sync subs between Stripe and DB
 * */
const db = require("../store/db");
const utility = require("../util/utility");
const config = require("../config");
// eslint-disable-next-line import/order
const stripe = require("stripe")(config.STRIPE_SECRET);

const { invokeInterval } = utility;

async function run() {
  // Get list of current subscribers
  const result = await stripe.subscriptions.list({
    limit: 100,
    status: "active",
    price: "price_1LE5NqCHN72mG1oKg2Y9pqXb",
  }).autoPagingToArray({limit: 100});

  console.log(result.length, "subs");
  await db.raw("BEGIN TRANSACTION");
  // Delete all status from subscribers
  await db.raw("UPDATE subscriber SET status = NULL");
  const updatePromises = result.map(sub => {
    return db.raw("UPDATE subscriber SET status = ? WHERE customer_id = ?", [
      sub.status,
      sub.customer,
    ]);
  });

  await Promise.all(updatePromises);
  await db.raw("COMMIT");
}

invokeInterval(run, 60 * 1000);
