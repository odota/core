var db = require('../store/db');
var redis = require('../store/redis');
var async = require('async');
var getGCData = require('../util/getGCData');
db.select(['match_id']).from('matches').asCallback(function (err, matches)
{
  if (err)
  {
    throw err;
  }
  async.eachSeries(matches, function (match, cb)
  {
    console.log(match.match_id);
    getGCData(db, redis, match, function(err){
      if (err)
      {
        console.error(err);
      }
      cb();
    });
  }, function (err)
  {
    if (err)
    {
      console.error(err);
    }
    process.exit(Number(err));
  });
});
