import express from "express";
import bodyParser from "body-parser";
import moment from "moment";
import stripe from "../store/stripe.ts";
import db from "../store/db.ts";
import config from "../../config.ts";
import { redisCount } from "../store/redis.ts";
import type Stripe from "stripe";

const stripeAPIPlan = config.STRIPE_API_PLAN;
const keys = express.Router();
keys.use(bodyParser.json());
keys.use(
  bodyParser.urlencoded({
    extended: true,
  }),
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
function getActiveKey(rows: any[]) {
  const notCanceled = rows.filter((row) => row.is_canceled != true);
  return notCanceled.length > 0 ? notCanceled[0] : null;
}
function hasActiveKey(getActiveKeyResult: any) {
  return getActiveKeyResult !== null;
}
async function getOpenInvoices(customerId: string) {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit: 100,
    status: "open",
  });
  return invoices.data;
}
/**
 * Invariant: A Stripe subscription and an API key is a 1 to 1 mapping. canceled sub = deleted key and vice versa a single user can have multiple subs but only one active at a given time (others have is_canceled = true).
 */
keys
  .route("/")
  .all(async (req, res, next) => {
    const rows = await db.from("api_keys").where({
      account_id: req.user?.account_id,
    });
    res.locals.keyRecord = getActiveKey(rows);
    res.locals.allKeyRecords = rows;
    next();
  })
  .get(async (req, res, next) => {
    const { keyRecord, allKeyRecords } = res.locals;
    if (!hasActiveKey(keyRecord) && allKeyRecords.length === 0) {
      return res.json({});
    }
    const getCustomer = async () => {
      if (!keyRecord) {
        return;
      }
      const { api_key, customer_id, subscription_id } = keyRecord;
      const toReturn: any = {
        api_key,
      };
      const sub = await stripe.subscriptions.retrieve(subscription_id);
      toReturn.current_period_end = sub.current_period_end;
      return toReturn;
    };
    const getInvoices = async () => {
      if (allKeyRecords.length === 0) {
        return;
      }
      const customer_id = allKeyRecords[0].customer_id;
      const invoices = await getOpenInvoices(customer_id);
      const processed = invoices.map((i: any) => ({
        id: i.id,
        amountDue: i.amount_due,
        paymentLink: i.hosted_invoice_url,
        created: i.created,
      }));
      return processed;
    };
    const getUsage = async () => {
      const { rows } = await db.raw(
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
                  concat(date_part('year', timestamp), '-', date_part('month', timestamp)) as month,
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
          moment.utc().subtract(5, "month").startOf("month"),
          moment.utc().endOf("month"),
          req.user?.account_id,
        ],
      );
      return rows;
    };
    const [customer, openInvoices, usage] = await Promise.all([
      getCustomer(),
      getInvoices(),
      getUsage(),
    ]);
    return res.json({ customer, openInvoices, usage });
  })
  .delete(async (req, res, next) => {
    // Deletes the key and subscription.
    const { keyRecord } = res.locals;
    if (!hasActiveKey(keyRecord)) {
      return res.sendStatus(200);
    }
    const { api_key, subscription_id } = keyRecord;
    // Immediately bill the customer for any unpaid usage
    await stripe.subscriptions.del(subscription_id, { invoice_now: true });
    await db
      .from("api_keys")
      .where({
        account_id: req.user?.account_id,
        subscription_id,
      })
      .update({
        is_canceled: true,
      });
    res.sendStatus(200);
  });

/**
 * Creates a Stripe-hosted Checkout Session for a new API key subscription.
 * Mirrors the pattern used for the /subscribeSuccess + /manageSub flow in web.ts:
 * the client is redirected to a Stripe-hosted page instead of collecting card
 * details itself (see https://docs.stripe.com/payments/checkout/migration).
 */
keys.post("/checkout", async (req, res, next) => {
  const { keyRecord, allKeyRecords } = res.locals;
  if (hasActiveKey(keyRecord)) {
    // Already has an active key/subscription, nothing to do
    return res.sendStatus(200);
  }
  // Optionally verify the account_id
  if (req.user?.account_id && Number(config.API_KEY_GEN_THRESHOLD)) {
    const threshold = await db
      .first("account_id")
      .from("players")
      .orderBy("account_id", "desc");
    const fail =
      Number(req.user?.account_id) >
      threshold.account_id - Number(config.API_KEY_GEN_THRESHOLD);
    if (fail) {
      redisCount("gen_api_key_invalid");
      return res.status(400).json({ error: "Failed validation" });
    }
  }
  // Returning customer: reuse the existing Stripe customer, block on unpaid invoices
  let customerId = allKeyRecords?.[0].customer_id;
  if (customerId) {
    const invoices = await getOpenInvoices(customerId);
    if (invoices.length > 0) {
      console.log(
        "Open invoices exist for",
        req.user?.account_id,
        "customer",
        customerId,
      );
      return res.status(402).json({ error: "Open invoice" });
    }
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: String(req.user?.account_id ?? ""),
    line_items: [
      {
        price: stripeAPIPlan,
        quantity: 1,
      },
    ],
    subscription_data: {
      billing_cycle_anchor: moment
        .utc()
        .add(1, "month")
        .startOf("month")
        .unix(),
      metadata: {
        account_id: req.user?.account_id ?? "",
      },
    },
    // Land back on this service (not the UI) so we can persist the new key
    // before bouncing the user to the UI, same as /subscribeSuccess does.
    success_url: `${config.ROOT_URL}/keys/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.UI_HOST}/api-keys`,
  });
  return res.json({ url: session.url });
});

/**
 * Stripe redirects here after a successful Checkout Session (see /checkout above).
 * Equivalent of /subscribeSuccess in web.ts, but provisions an API key/subscription
 * pair instead of a subscriber row.
 */
keys.get("/success", async (req, res, next) => {
  if (!req.query.session_id) {
    return res.status(400).json({ error: "no session ID" });
  }
  if (!req.user?.account_id) {
    return res.status(400).json({ error: "no account ID" });
  }
  // look up the checkout session id: https://stripe.com/docs/payments/checkout/custom-success-page
  const session = await stripe.checkout.sessions.retrieve(
    req.query.session_id as string,
    { expand: ["subscription"] },
  );
  const subscription = session.subscription as Stripe.Subscription;
  const apiKey = crypto.randomUUID();
  // Store the generated key on the subscription for reference/debugging
  await stripe.subscriptions.update(subscription.id, {
    metadata: { apiKey },
  });
  await db.raw(
    `
          INSERT INTO api_keys (account_id, api_key, customer_id, subscription_id)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (account_id, subscription_id) DO UPDATE SET
          api_key = ?, customer_id = ?, subscription_id = ?
        `,
    [
      req.user.account_id,
      apiKey,
      session.customer,
      subscription?.id,
      apiKey,
      session.customer,
      subscription?.id,
    ],
  );
  // Send the user back to the API key management page
  return res.redirect(`${config.UI_HOST}/api-keys`);
});

/**
 * Creates a Stripe Billing Portal session so the customer can update their
 * payment method, replacing the old client-side "update billing" card token
 * flow. Mirrors /manageSub in web.ts.
 */
keys.post("/manage", async (req, res, next) => {
  const { keyRecord } = res.locals;
  if (!hasActiveKey(keyRecord)) {
    return res.status(400).json({ error: "No active key found" });
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: keyRecord.customer_id,
    return_url: req.body?.return_url || `${config.UI_HOST}/api-keys`,
  });
  return res.json({ url: session.url });
});

export default keys;
