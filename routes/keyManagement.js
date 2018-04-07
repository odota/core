const express = require('express');

const keys = express.Router();
const config = require('../config');
const async = require('async');

const stripeSecret = config.STRIPE_SECRET;
const stripeAPIPlan = config.STRIPE_API_PLAN;
const stripe = require('stripe')(stripeSecret);
const uuid = require('uuid/v4');
const bodyParser = require('body-parser');
const moment = require('moment');
const db = require('../store/db');

keys.use(bodyParser.json());
keys.use(bodyParser.urlencoded({
  extended: true,
}));

keys.use((req, res, next) => {
  // req.user = {
  //   account_id: 102344608
  // };

  if (!req.user) {
    return res.status(403).json({
      error: 'Authentication required',
    });
  }

  return next();
});

keys.route('/').get((req, res, next) => {
  db.from('api_keys')
    .where({
      account_id: req.user.account_id,
    }).asCallback((err, results) => {
      if (err) {
        next(err);
      } else if (results.length > 0) {
        async.parallel({
          customer: (cb) => {
            stripe.customers.retrieve(results[0].customer_id, (err, customer) => {
              if (err) {
                cb(err);
              } else {
                // const source = customer.sources.data[0];

                // results[0].credit_brand = source.brand;
                // results[0].credit_last4 = source.last4;

                cb(null, results[0]);
              }
            });
          },
          usage: (cb) => {
            db.raw(`
                SELECT
                  account_id,
                  month,
                  SUM(usage_count) as usage_count,
                  ARRAY_AGG(api_key) as api_keys
                FROM (  
                  SELECT
                    account_id,
                    api_key,
                    date_part('month', timestamp) as month,
                    MAX(usage_count) as usage_count
                  FROM api_key_usage
                  WHERE
                    timestamp >= ?
                    AND timestamp <= ?
                    AND account_id = ?
                  GROUP BY account_id, api_key, month
                ) as T1
                GROUP BY account_id, month
                ORDER BY month DESC
              `, [moment().subtract(1, 'month').startOf('month'), moment().endOf('month'), req.user.account_id])
              .asCallback((err, results) => cb(err, err ? null : results.rows));
          },
        }, (err, results) => {
          if (err) {
            next(err);
          } else {
            res.json(results);
          }
        });
      } else {
        res.json({});
      }
    });
}).post((req, res, next) => {
  const { token, metadata } = req.body;
  metadata.account_id = req.user.account_id;

  if (!token) {
    res.sendStatus(500).json({
      error: 'Missing token',
    });
  } else {
    let apiKey = uuid();

    // Customers and subscriptions shouldn't ever be deleted since we have tiered billing
    // otherwise people could just re-create keys.
    // Therefore, check if there's customer/sub already, and if so, reuse.
    db.from('api_keys').where({
      account_id: req.user.account_id,
    })
      .then((rows) => {
        if (rows.length === 0 || rows[0].customer_id === null || rows[0].subscription_id === null) {
          apiKey = uuid();

          return stripe.customers.create({
            source: token.id,
            email: token.email,
            metadata,
          })
            .then(customer => stripe.subscriptions.create({
              customer: customer.id,
              items: [{ plan: stripeAPIPlan }],
              metadata: {
                api_key: apiKey,
              },
            }));
        }

        // If we had an API key already, we don't need to regenerate it
        apiKey = rows[0].api_key || apiKey;

        return stripe.customers.update(rows[0].subscription_id, {
          email: token.email,
          metadata,
        }).then(() => stripe.subscriptions.retrieve(rows[0].subscription_id))
          .then((sub) => {
            sub.metadata.api_key = apiKey;
            stripe.subscriptions.update(rows[0].subscription_id, {
              source: token.id,
              metadata: sub.metadata,
            });
          });
      })
      .then(sub => db.raw(`
        INSERT INTO api_keys (account_id, api_key, customer_id, subscription_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (account_id) DO UPDATE SET
        api_key = ?, customer_id = ?, subscription_id = ?
      `, [req.user.account_id, apiKey, sub.customer, sub.id, apiKey, sub.customer, sub.id]))
      .then(() => res.json({}))
      .catch((err) => {
        next(err);
      });
  }
}).delete((req, res, next) => {
  db.from('api_keys').where({
    account_id: req.user.account_id,
  })
    .asCallback((err, rows) => {
      if (err) {
        return next(err);
      }

      if (rows.length === 0 || !rows[0].api_key) {
        return res.sendStatus(200);
      }

      return stripe.subscriptions.retrieve(rows[0].subscription_id)
        .then((sub) => {
          const oldKeys = sub.metadata.old_keys || [];
          oldKeys.push(sub.metadata.api_key);
          sub.metadata.old_keys = oldKeys;
          sub.metadata.api_key = null;

          return stripe.subscriptions.update(rows[0].subscription_id, {
            metadata: sub.metadata,
          });
        })
        .then(() => db.from('api_keys')
          .where({
            account_id: req.user.account_id,
          })
          .update({
            api_key: null,
          }))
        .then(() => res.sendStatus(200))
        .catch((err) => {
          next(err);
        });
    });
})
  .put((req, res, next) => { // Updates billing
    const { token, metadata } = req.body;

    if (!token) {
      res.status(500).json({
        error: 'Missng token',
      });
    } else {
      let customerId;
      let subscriptionId;

      db.from('api_keys').where({
        account_id: req.user.account_id,
      })
        .then((rows) => {
          console.log(rows);
          if (rows.length < 1) {
            throw Error('No record to update.');
          } else {
            customerId = rows[0].subscription_id;
            subscriptionId = rows[0].subscription_id;
          }
        })
        .then(() => stripe.customers.update(customerId, {
          email: token.email,
          metadata,
        }))
        .then(() => stripe.subscriptions.update(subscriptionId, {
          source: token.id,
        }))
        .then(() => res.sendStatus(200))
        .catch(err => next(err));
    }
  });

module.exports = keys;
