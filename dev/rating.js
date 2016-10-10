const db = require('../db');
const async = require('async');
db.ratings.find({}, {
  sort: {
    time: 1,
  },
}, (err, docs) => {
  if (err) {
    console.log(err);
  }
  async.eachSeries(docs, (d, cb) => {
    db.players.update({
      account_id: d.account_id,
    }, {
      $push: {
        ratings: d,
      },
    }, (err) => {
      console.log(d);
      cb(err);
    });
  }, (err) => {
    if (err) {
      console.log(err);
    }
    console.log('done!');
  });
});
