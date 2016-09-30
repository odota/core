const db = require('../db');
db.matches.find({
  'parsed_data.version': {
    $gt: 0,
  },
}).each((doc) => {
  if (doc.parse_status !== 2) {
    db.matches.update({
      match_id: doc.match_id,
    }, {
      $set: {
        parse_status: 2,
      },
    }, (err) => {
      console.log('repaired %s', doc.match_id);
    });
  }
}).error((err) => {
  console.log(err);
}).success(() => {
  console.log('repair done');
});
