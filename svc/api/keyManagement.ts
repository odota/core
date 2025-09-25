import express from 'express';
import bodyParser from 'body-parser';
import moment from 'moment';
import stripe from '../store/stripe.ts';
import db from '../store/db.ts';
import config from '../../config.ts';
import { redisCount } from '../util/utility.ts';

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
      error: 'Authentication required',
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
function hasToken(req: express.Request) {
  const { token } = req.body;
  return token && token.id && token.email;
}
async function getOpenInvoices(customerId: string) {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit: 100,
    status: 'open',
  });
  return invoices.data;
}
/**
 * Invariant: A Stripe subscription and an API key is a 1 to 1 mapping. canceled sub = deleted key and vice versa a single user can have multiple subs but only one active at a given time (others have is_canceled = true).
 */
keys
  .route('/')
  .all(async (req, res, next) => {
    const rows = await db.from('api_keys').where({
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
      const customer = await stripe.customers.retrieve(customer_id);
      //@ts-expect-error
      const source = customer.sources.data[0];
      toReturn.credit_brand = source?.brand;
      toReturn.credit_last4 = source?.last4;
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
          moment.utc().subtract(5, 'month').startOf('month'),
          moment.utc().endOf('month'),
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
      .from('api_keys')
      .where({
        account_id: req.user?.account_id,
        subscription_id,
      })
      .update({
        is_canceled: true,
      });
    res.sendStatus(200);
  })
  .post(async (req, res, next) => {
    // Creates key
    if (!hasToken(req)) {
      return res.status(500).json({
        error: 'Missing token',
      });
    }
    const { keyRecord, allKeyRecords } = res.locals;
    const { token } = req.body;
    let customer_id;
    if (hasActiveKey(keyRecord)) {
      console.log('Active key exists for', req.user?.account_id);
      return res.sendStatus(200);
    }
    // Optionally verify the account_id
    if (req.user?.account_id && Number(config.API_KEY_GEN_THRESHOLD)) {
      const threshold = await db
        .first('account_id')
        .from('players')
        .orderBy('account_id', 'desc');
      const fail =
        Number(req.user?.account_id) >
        threshold.account_id - Number(config.API_KEY_GEN_THRESHOLD);
      if (fail) {
        redisCount('gen_api_key_invalid');
        return res.sendStatus(400).json({ error: 'Failed validation' });
      }
    }
    // returning customer
    if (allKeyRecords.length > 0) {
      customer_id = allKeyRecords[0].customer_id;
      const invoices = await getOpenInvoices(customer_id);
      if (invoices.length > 0) {
        console.log(
          'Open invoices exist for',
          req.user?.account_id,
          'customer',
          customer_id,
        );
        return res.status(402).json({ error: 'Open invoice' });
      }
      try {
        await stripe.customers.update(customer_id, {
          email: token.email,
          source: token.id,
        });
      } catch (err) {
        // probably insufficient funds
        return res.status(402).json(err);
      }
    }
    // New customer -> create customer first
    else {
      try {
        const customer = await stripe.customers.create({
          source: token.id,
          email: token.email,
          metadata: {
            account_id: req.user?.account_id ?? '',
          },
        });
        customer_id = customer.id;
      } catch (err) {
        // probably insufficient funds
        return res.status(402).json(err);
      }
    }
    const apiKey = crypto.randomUUID();
    const sub = await stripe.subscriptions.create({
      customer: customer_id,
      items: [{ plan: stripeAPIPlan }],
      billing_cycle_anchor: moment
        .utc()
        .add(1, 'month')
        .startOf('month')
        .unix(),
      metadata: {
        apiKey,
      },
    });
    await db.raw(
      `
          INSERT INTO api_keys (account_id, api_key, customer_id, subscription_id)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (account_id, subscription_id) DO UPDATE SET
          api_key = ?, customer_id = ?, subscription_id = ?
        `,
      [
        req.user?.account_id,
        apiKey,
        sub.customer,
        sub.id,
        apiKey,
        sub.customer,
        sub.id,
      ],
    );
    res.sendStatus(200);
  })
  .put(async (req, res, next) => {
    // Updates billing
    if (!hasToken(req)) {
      return res.status(400).json({
        error: 'Missing token',
      });
    }
    const { keyRecord } = res.locals;
    if (!hasActiveKey(keyRecord)) {
      throw Error('No record to update.');
    }
    const { customer_id, subscription_id } = keyRecord;
    const {
      token: { email, id },
    } = req.body;
    await stripe.customers.update(customer_id, {
      email,
    });
    await stripe.subscriptions.update(subscription_id, {
      //@ts-expect-error
      source: id,
    });
    res.sendStatus(200);
  });
export default keys;
