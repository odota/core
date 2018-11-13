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

hooks.route('/')
  .get((req, res, next) => {
    db.select('hook_id')
      .from('webhooks')
      .where('account_id', req.user.account_id)
      .asCallback((err, results) => {
        if (err) {
          next(err);
        } else if (results.length === 0) {
          res.json({});
        } else {
          res.json(results.map(result => ({
            hook_id: result.hook_id,
          })));
        }
      });
  })
  .post((req, res, next) => {
    console.log(req.body);
    const { url, subscriptions } = req.body;
    const { teams, players, leagues } = subscriptions;
    const accountId = req.user.account_id;

    if (!url) {
      res.sendStatus(400).json({
        error: 'Missing url',
      });
      return;
    }
    if ((!teams && !players && !leagues)
      || (teams.length === 0 && players.length === 0 && leagues.length === 0)) {
      res.sendStatus(400).json({
        error: 'Missing subscriptions',
      });
      return;
    }

    console.log(accountId);
    console.log(url);
    db
      .from('webhooks')
      .where({
        account_id: accountId,
        url,
      })
      .then((rows) => {
        if (rows.length > 0) {
          throw Error('URL exists');
        }
        const hookId = uuid();
        db('webhooks').insert({
          hook_id: hookId,
          account_id: accountId,
          url,
          subscriptions: {
            teams,
            players,
            leagues,
          },
        }).then((rows) => {
          if (rows.length === 0) {
            throw Error('Could not create webhook');
          }
          res.sendStatus(200);
        });
      })
      .catch((err) => {
        if (err.message === 'URL exists') {
          return res.sendStatus(500).json({
            error: 'URL exists. Use PUT to update',
          });
        }
        console.log(err);
        return next(err);
      });
  });

hooks.route('/:hookId')
  .get((req, res, next) => db('webhooks')
    .select('hook_id', 'url', 'subscriptions')
    .where({
      account_id: req.user.account_id,
    })
    .then(rows => res.sendStatus(200).json(rows))
    .catch((err) => {
      console.log(err);
      return next(err);
    }))
  .delete((req, res, next) => db('webhooks')
    .where({
      account_id: req.user.account_id,
      hook_id: req.params.hookId,
    })
    .del()
    .then((rows) => {
      if (rows.length === 0) {
        throw Error('Unknown hook');
      }
    })
    .catch((err) => {
      if (err.message === 'Unknown hook') {
        return res.sendStatus(200);
      }
      console.log(err);
      return next(err);
    }))
  .put((req, res, next) => {
    const { subscriptions } = req.body;
    const { teams, players, leagues } = subscriptions;

    if ((!teams && !players && !leagues)
      || (teams.length === 0 && players.length === 0 && leagues.length === 0)) {
      res.sendStatus(400).json({
        error: 'Missing subscriptions',
      });
      return;
    }

    db('webhooks')
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
      .then(() => res.sendStatus(200))
      .catch((err) => {
        console.log(err);
        return next(err);
      });
  });

module.exports = hooks;
