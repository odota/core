const db = require('../store/db');
const redis = require('../store/redis');
const async = require('async');
const getGCData = require('../util/getGCData');
db.select(['match_id']).from('matches').asCallback((err, matches) => {
  if (err)
  {
    throw err;
  }
  async.eachSeries(matches, (match, cb) => {
    console.log(match.match_id);
    getGCData(db, redis, match, (err) => {
      if (err)
      {
        console.error(err);
      }
      cb();
    });
  }, (err) => {
    if (err)
    {
      console.error(err);
    }
    process.exit(Number(err));
  });
});
