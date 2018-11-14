const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('uuid/v4');
const db = require('../store/db');

const hooks = express.Router();

hooks.use(bodyParser.json());
hooks.use(bodyParser.urlencoded({
  extended: true,
}));

hooks.use((req, res, next) => {
  if (!req.user) {
    return res.status(403).json({
      error: 'Authentication required',
    });
  }

  return next();
});

function isValidHookId(req, res, next) {
  const { hookId } = req.params;
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(hookId);
  if (!valid) {
    return res.status(400).json({ error: 'Invalid webhook id' });
  }
  return next();
}

function isValidUrl(req, res, next) {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Missing url' });
  }
  return next();
}

function isValidSubscriptions(req, res, next) {
  const { subscriptions } = req.body;
  if (!subscriptions) {
    return res.status(400).json({ error: 'Missing subscriptions' });
  }

  const { teams, players, leagues } = subscriptions;
  if ((!teams || !teams.length)
    && (!players || !players.length)
    && (!leagues || !leagues.length)) {
    return res.status(400).json({
      error: 'You need to subscribe to at least one category',
    });
  }

  return next();
}

hooks.route('/')
  // List all of a user's webhooks
  .get((req, res, next) => {
    db.select('hook_id')
      .from('webhooks')
      .where('account_id', req.user.account_id)
      .then(results => res.json(results))
      .catch((err) => {
        console.log(err);
        return next(err);
      });
  })
  // Create a new webhook
  .post(isValidUrl, isValidSubscriptions, (req, res, next) => {
    const accountId = req.user.account_id;
    const { url, subscriptions } = req.body;
    const { teams, players, leagues } = subscriptions;

    return db
      .from('webhooks')
      .where({
        account_id: accountId,
        url,
      })
      .then((rows) => {
        if (rows.length > 0) {
          throw Error('URL exists');
        }
        return db('webhooks').insert({
          hook_id: uuid(),
          account_id: accountId,
          url,
          subscriptions: {
            teams,
            players,
            leagues,
          },
        });
      }).then((rows) => {
        if (rows.length === 0) {
          throw Error('Could not create webhook');
        }
        return res.sendStatus(200);
      })
      .catch((err) => {
        if (err.message === 'URL exists') {
          return res.status(400).json({
            error: 'URL exists. Use PUT to update',
          });
        }
        console.log(err);
        return next(err);
      });
  });

hooks.route('/:hookId')
  // Get the details of a webhook
  .get(isValidHookId, (req, res, next) => db('webhooks')
    .select('hook_id', 'url', 'subscriptions')
    .where({
      account_id: req.user.account_id,
      hook_id: req.params.hookId,
    })
    .then(rows => (rows.length > 0 ? res.json(rows[0]) : res.sendStatus(404)))
    .catch((err) => {
      console.log(err);
      return next(err);
    }))
  // Delete a webhook
  .delete(isValidHookId, (req, res, next) => db('webhooks')
    .where({
      account_id: req.user.account_id,
      hook_id: req.params.hookId,
    })
    .del()
    .then(rows => res.sendStatus(rows === 0 ? 404 : 200))
    .catch((err) => {
      console.log(err);
      return next(err);
    }))
  // Update a webhook
  .put(isValidHookId, isValidSubscriptions, (req, res, next) => {
    const { subscriptions } = req.body;
    const { teams, players, leagues } = subscriptions;

    return db('webhooks')
      .where({
        account_id: req.user.account_id,
        hook_id: req.params.hookId,
      })
      .update({
        subscriptions: {
          teams,
          players,
          leagues,
        },
      })
      .then(result => res.sendStatus(result === 0 ? 404 : 200))
      .catch((err) => {
        console.log(err);
        return next(err);
      });
  });

module.exports = hooks;
