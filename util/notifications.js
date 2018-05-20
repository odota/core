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


function sendNotificationViaToken(token, data, cb) {
  firebase.messaging().send({
    data: data,
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

function sendNotificationViaAccountId(accountId, data, cb) {
  redis.hget('notification_users', accountId, (err, res) => {
    if (err) {
      cb(err);
    } else {
      if (res) {
        console.log(res);
        sendNotificationViaToken(res, data, cb);
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