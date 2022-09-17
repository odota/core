const express = require("express");
const uuid = require("uuid/v4");
const bodyParser = require("body-parser");
const moment = require("moment");
const async = require("async");
const stripeLib = require("stripe");
const db = require("../store/db");
const redis = require("../store/redis");
const config = require("../config");

const stripe = stripeLib(config.STRIPE_SECRET);
const stripeAPIPlan = config.STRIPE_API_PLAN;
const keys = express.Router();

keys.use(bodyParser.json());
keys.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

keys.use((req, res, next) => {
  if (!req.user) {
    return res.status(403).json({
      error: "Authentication required",
    });
  }

  return next();
});

// @param rows - query result from api_keys table
function getActiveKey(rows) {
  const notCanceled = rows.filter(row => row.is_canceled != true);

  return notCanceled.length > 0 ? not_canceled[0] : null;
}

// @param rows - query result from api_keys table
function hasActiveKey(rows) {
  return getActiveKey(rows) !== null;
}

/**
 * Invariant: A Stripe subscription and an API key is a 1 to 1 mapping. canceled sub = deleted key and vice versa a single user can have multiple subs but only one active at a given time (others have is_canceled = true).
 */
keys
  .route("/")
  .get((req, res, next) => {
    db.from("api_keys")
      .where({
        account_id: req.user.account_id,
      })
      .asCallback((err, results) => {
        if (err) {
          return next(err);
        } 
        
        const keyRecord = getActiveKey(results);
        if (keyRecord === null) {
          return res.json({});
        }

          async.parallel(
            {
              customer: (cb) => {


                const toReturn = {
                  api_key: results[0].api_key,
                };

                stripe.customers
                  .retrieve(results[0].customer_id)
                  .then((customer) => {
                    const source = customer.sources.data[0];

                    toReturn.credit_brand = source.brand;
                    toReturn.credit_last4 = source.last4;

                    return stripe.subscriptions.retrieve(
                      results[0].subscription_id
                    );
                  })
                  .then((sub) => {
                    toReturn.current_period_end = sub.current_period_end;
                  })
                  .then(() => cb(null, toReturn))
                  .catch((err) => cb(err));
              },
              usage: (cb) => {
                db.raw(
                  `
                SELECT
                  account_id,
                  month,
                  SUM(usage_count) as usage_count,
                  ARRAY_AGG(api_key) as api_keys
                FROM (  
                  SELECT
                    account_id,
                    api_key,
                    ip,
                    date_part('month', timestamp) as month,
                    MAX(usage_count) as usage_count
                  FROM api_key_usage
                  WHERE
                    timestamp >= ?
                    AND timestamp <= ?
                    AND account_id = ?
                  GROUP BY account_id, api_key, ip, month
                ) as T1
                GROUP BY account_id, month
                ORDER BY month DESC
              `,
                  [
                    moment().subtract(5, "month").startOf("month"),
                    moment().endOf("month"),
                    req.user.account_id,
                  ]
                ).asCallback((err, results) =>
                  cb(err, err ? null : results.rows)
                );
              },
            },
            (err, results) => {
              if (err) {
                next(err);
              } else {
                res.json(results);
              }
            }
          );
        
      });
  })
  .delete(async (req, res) => {
    // Deletes the key and subscription.
    const rows = await db
      .from("api_keys")
      .where({
        account_id: req.user.account_id,
      })
      .andWhereNot("is_canceled", "=", true);

    if (rows.length === 0) {
      return res.sendStatus(200);
    }

    const { subscription_id } = rows[0];

    // Immediately bill the customer for any unpaid usage
    await stripe.subscriptions.del(subscription_id, { invoice_now: true });

    await db
      .from("api_keys")
      .where({
        account_id: req.user.account_id,
        subscription_id,
      })
      .update({
        is_canceled: true,
      });

    // Force the key to be disabled
    redis.srem("api_keys", rows[0].api_key, (err) => {
      if (err) {
        throw err;
      }

      res.sendStatus(200);
    });
  })
  .use((req, res) => {
    const { token } = req.body;
    if (!token || !token.id || !token.email) {
      return res.sendStatus(500).json({
        error: "Missing token",
      });
    }
  })
  .post(async (req, res) => {
    // Creates key

    // Check if there is already an active subscription
    const rows = await db.from("api_keys").where({
      account_id: req.user.account_id,
    });

    const { token } = req.body;

    let customer_id;
    // New customer -> create customer first
    if (rows.length === 0) {
      const customer = await stripe.customers.create({
        source: token.id,
        email: token.email,
        metadata: {
          account_id: req.user.account_id,
        },
      });
      customer_id = customer.id;
    } else {
      // Existing customer -> must have no active keys
      if (hasActiveKey(rows)) {
        console.log("Active key exists for", req.user.account_id);
        return res.sendStatus(200);
      }

      customer_id = rows[0].customer_id;
      await stripe.customers.update(rows[0].customer_id, {
        email: token.email,
      });
    }

    const apiKey = uuid();

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ plan: stripeAPIPlan }],
      billing_cycle_anchor: moment().add(1, "month").startOf("month").unix(),
      metadata: {
        apiKey,
      },
    });

    await db.raw(
      `
        INSERT INTO api_keys (account_id, api_key, customer_id, subscription_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (account_id) DO UPDATE SET
        api_key = ?, customer_id = ?, subscription_id = ?
      `,
      [
        req.user.account_id,
        apiKey,
        sub.customer,
        sub.id,
        apiKey,
        sub.customer,
        sub.id,
      ]
    );

    // Add the key to Redis so that it works immediately
    redis.sadd("api_keys", apiKey, (err) => {
      if (err) {
        throw err;
      }

      res.sendStatus(200);
    });
  })
  .put(async (req, res) => {
    // Updates billing

    const rows = await db
      .from("api_keys")
      .where({
        account_id: req.user.account_id,
      })
      .andWhereNot("is_canceled", "=", true);

    if (rows.length < 1) {
      throw Error("No record to update.");
    }

    const { customer_id, subscription_id } = rows[0];
    const {
      token: { email, id },
    } = req.body;

    await stripe.customers.update(customer_id, {
      email,
    });

    await stripe.subscriptions.update(subscription_id, {
      source: id,
    });

    res.sendStatus(200);
  });

module.exports = keys;
