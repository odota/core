const express = require('express');
const uuid = require('uuid/v4');
const bodyParser = require('body-parser');
const moment = require('moment');
const redis = require('../store/redis');

const notifications = express.Router();

notifications.use(bodyParser.json());
notifications.use(bodyParser.urlencoded({
  extended: true,
}));

notifications.use((req, res, next) => {
  if (!req.user) {
    return res.status(403).json({
      error: 'Authentication required',
    });
  }

  return next();
});

notifications.route('/')
  .post((req, res) => {
    const { token } = req.body;

    if (!token) {
      res.status(500).json({
        error: 'Missng token',
      });
    } else {
      redis.multi()
        .zadd('notification_tokens', moment().unix(), token)
        .hset('notification_users', req.user ? req.user.account_id : uuid, token)
        .exec(err => res.sendStatus(err ? 500 : 200));
    }
  });

module.exports = notifications;
