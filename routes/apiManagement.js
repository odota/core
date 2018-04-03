const express = require('express');

const api = express.Router();
const config = require('../config');
const async = require('async');

const stripeSecret = config.STRIPE_SECRET;
const stripePublic = config.STRIPE_PUBLIC;
const stripe = require('stripe')(stripeSecret);
const uuid = require('uuid/v4');
const bodyParser = require('body-parser');
const moment = require('moment');
const db = require('../store/db');

function checkErr(err) {
  if (err.raw_type === 'card_error') {
    return 'There was a problem processing your card. ' +
                 'Did you enter the details correctly?';
  }
  return 'There was a problem processing your request. ' +
                 'If you keep getting errors, please contact support@yasp.co for support.';
}

api.use(bodyParser.json());
api.use(bodyParser.urlencoded({
  extended: true,
}));

api.use((req, res, next) => {
  if (!req.user) {
    return res.status(403).json({
      error: 'Authentication required',
    });
  }

  return next();
});

api.route('/').get((req, res, next) => {
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
                const source = customer.sources.data[0];

                cb(null, {
                  credit_brand: source.brand,
                  credit_last4: source.last4,
                });
              }
            });
          },
          usage: (cb) => {
            db.raw(`
                SELECT
                  account_id,
                  month,
                  SUM(usage_count) as usage_count,
                  ARRAY_AGG(api_key) as api_keys,
                  ARRAY_AGG(DISTINCT ip) as ips
                FROM (  
                  SELECT
                    account_id,
                    api_key,
                    ip,
                    date_part('month', timestamp) as month
                    MAX(usage_count) as usage_count
                  FROM api_key_usage
                  WHERE
                    timestamp >= ?
                    AND timestamp <= ?
                  GROUP BY account_id, api_key, ip, month
                ) as T1
                GROUP BY account_id, month
                ORDER BY month DESC
              `, [moment().subtract(1, 'month').startOf('month'), moment().endOf('month')])
              .asCallback(cb);
          },
        }, (err, results) => {
          if (err) {
            next(err);
          } else {
            results.stripe_public = stripePublic;

            res.json(results);
          }
        });
      } else {
        res.json({
          key: null,
          stripe_public: stripePublic,
        });
      }
    });
}).post((req, res, next) => {
  const { token } = req.body;

  if (!token) {
    res.sendStatus(500).json({
      error: 'Missing token',
    });
  } else {
    stripe.customers.create({
      source: token.id,
      email: token.email,
    }, (err, customer) => {
      if (err) {
        res.json({
          error: checkErr(err),
        });
      } else {
        const apiKey = uuid();

        db.raw(`
          INSERT INTO api_keys (account_id, api_key, customer_id)
          VALUES (?, ?, ?)
          ON CONFLICT (account_id) DO UPDATE SET
          api_key = ?, customer_id = ?
        `, [req.user.account_id, apiKey, customer.id, apiKey, customer.id])
          .asCallback((err) => {
            if (err) {
              next(err);
            } else {
              stripe.customers.update(customer.id, {
                metadata: {
                  account_id: req.user.account_id,
                  apiKey,
                },
              }, (err) => {
                if (err) {
                  return next(err);
                }

                return res.sendStatus(200);
              });
            }
          });
      }
    });
  }
}).delete((req, res, next) => {
  db.from('api_keys')
    .where({
      account_id: req.user.account_id,
    })
    .update({
      api_key: null,
    })
    .asCallback((err) => {
      if (err) {
        return next(err);
      }

      return res.sendStatus(200);
    });
});

api.route('/updateBilling').post((req, res, next) => {
  const { token } = req.body;

  if (!token) {
    res.status(500).json({
      error: 'Missng token',
    });
  } else {
    db.from('api_keys')
      .where({
        account_id: req.user.account_id,
      }).asCallback((err, results) => {
        if (err) {
          next(err);
        } else if (results.length < 1) {
          next('No previous entry to update.');
        } else {
          stripe.customers.update(results[0].customer_id, {
            source: token.id,
            email: token.email,
          }, (err) => {
            if (err) {
              return next(err);
            }

            return res.sendStatus(200);
          });
        }
      });
  }
});

module.exports = api;
