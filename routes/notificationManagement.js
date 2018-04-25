const express = require('express');
const uuid = require('uuid/v4');
const bodyParser = require('body-parser');
const moment = require('moment');
const firebase = require('firebase-admin');
//const async = require('async');
//const db = require('../store/db');
const redis = require('../store/redis');
const config = require('../config');

firebase.initializeApp({
  credential: firebase.credential.applicationDefault()
});

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
  .post((req, res, next) => {
    const { token } = req.body;

    console.log(token);
    if (!token) {
      res.status(500).json({
        error: 'Missng token',
      });
    } else {
      redis.multi()
      .zadd('notification_tokens', moment().unix(), token)
      .hset('notification_users', req.user ? req.user.account_id : uuid, token);
    }
  });

module.exports = notifications;
