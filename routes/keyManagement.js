const express = require('express');
const uuid = require('uuid/v4');
const bodyParser = require('body-parser');
const moment = require('moment');
const async = require('async');
const db = require('../store/db');
const config = require('../config');
const stripe = require('stripe')(config.STRIPE_SECRET);

const stripeAPIPlan = config.STRIPE_API_PLAN;
const keys = express.Router();

keys.use(bodyParser.json());
keys.use(bodyParser.urlencoded({
  extended: true,
}));

keys.use((req, res, next) => {
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
      } else if (results.length === 0) {
        res.json({});
      } else {
        async.parallel({
          customer: (cb) => {
            const toReturn = {
              api_key: results[0].api_key,
            };

            stripe.customers.retrieve(results[0].customer_id)
              .then((customer) => {
                const source = customer.sources.data[0];

                toReturn.credit_brand = source.brand;
                toReturn.credit_last4 = source.last4;

                return stripe.subscriptions.retrieve(results[0].subscription_id);
              })
              .then((sub) => {
                toReturn.current_period_end = sub.current_period_end;
              })
              .then(() => cb(null, toReturn))
              .catch(err => cb(err));
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
      }
    });
}).post((req, res, next) => { // Creates key
  const { token } = req.body;

  if (!token || !token.id || !token.email) {
    res.sendStatus(500).json({
      error: 'Missing token',
    });
  } else {
    const apiKey = uuid();

    // Customers and subscriptions shouldn't ever be deleted since we have tiered billing
    // otherwise people could just re-create keys.
    // Therefore, check if there's customer/sub already, and if so, reuse.
    db.from('api_keys').where({
      account_id: req.user.account_id,
    })
      .then((rows) => {
        if (rows.length > 0 && rows[0].api_key) {
          throw Error('Key exists');
        }

        if (rows.length === 0) {
          return stripe.customers.create({
            source: token.id,
            email: token.email,
            metadata: {
              account_id: req.user.account_id,
            },
          })
            .then(customer => stripe.subscriptions.create({
              customer: customer.id,
              items: [{ plan: stripeAPIPlan }],
              billing_cycle_anchor: moment().add(1, 'month').startOf('month').unix(),
              metadata: {
                api_key: apiKey,
              },
            }));
        }

        return stripe.customers.update(rows[0].customer_id, {
          email: token.email,
        }).then(() => stripe.subscriptions.retrieve(rows[0].subscription_id))
          .then((sub) => {
            sub.metadata.api_key = apiKey;
            return stripe.subscriptions.update(rows[0].subscription_id, {
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
      .then(() => res.sendStatus(200))
      .catch((err) => {
        if (err.message === 'Key exists') {
          return res.sendStatus(200);
        }
        console.log(err);
        return next(err);
      });
  }
}).delete((req, res, next) => { // Deletes the current key.
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
          sub.metadata[`old_key_${moment().unix()}`] = sub.metadata.api_key;
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
          console.log(err);
          next(err);
        });
    });
})
  .put((req, res, next) => { // Updates billing
    const { token } = req.body;

    if (!token || !token.id || !token.email) {
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
          if (rows.length < 1) {
            throw Error('No record to update.');
          } else {
            customerId = rows[0].customer_id;
            subscriptionId = rows[0].subscription_id;
          }
        })
        .then(() => stripe.customers.update(customerId, {
          email: token.email,
        }))
        .then(() => stripe.subscriptions.update(subscriptionId, {
          source: token.id,
        }))
        .then(() => res.sendStatus(200))
        .catch(err => {
          console.log(err);
          next(err);
        });
    }
  });

module.exports = keys;
