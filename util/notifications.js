const firebase = require('firebase-admin');
const config = require('../config');
const redis = require('../store/redis');

firebase.initializeApp({
  credential: firebase.credential.cert({
    projectId: config.GCP_PROJECT_ID,
    clientEmail: config.GCP_CLIENT_EMAIL,
    privateKey: config.GCP_PRIVATE_KEY
  }),
  projectId: config.GCP_PROJECT_ID
});


function sendNotificationViaToken(token, title, body, url, icon, cb) {
  firebase.messaging().send({
    data: {
      url: url
    },
    notification: {
      title: title,
      body: body,
    },
    android: { // Android specific options
      ttl: 3600 * 1000,
      notification: {
        icon: icon.android || null,
        color: '#f45342',
      },
    },
    apns: { // iOS specific options
      payload: {
        aps: {
          badge: icon.ios || 0,
        },
      },
    },
    webpush: {
      notification: {
        icon: icon.web || null
      }
    },
    token: token
  })
  .then((response) => {
    // Response is a message ID string.
    console.log('Successfully sent message:', response);
    cb(true);
  })
  .catch((err) => {
    console.log('Error sending message:', err);
    cb(err)
  });
}

function sendNotificationViaAccountId(accountId, title, body, icon, cb) {
  redis.hget('notification_users', accountId, (err, res) => {
    if (err) {
      cb(err);
    } else {
      if (res) {
        console.log(res);
        sendNotificationViaToken(res, title, body, icon, cb);
      } else {
        cb(false)
      }
    }
  })
}

module.exports = {
  sendNotificationViaToken,
  sendNotificationViaAccountId
};