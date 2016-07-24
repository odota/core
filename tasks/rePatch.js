var db = require('../store/db');
var queries = require('../store/queries');
var async = require('async');
var constants = require('dotaconstants');
var utility = require('../util/utility');
db.select(['match_id', 'start_time']).from('matches').asCallback(function (err, match_ids)
{
  if (err)
  {
    throw err;
  }
  async.eachSeries(match_ids, function (match, cb)
  {
    console.log(match.match_id);
    queries.upsert(db, 'match_patch',
    {
      match_id: match.match_id,
      patch: constants.patch[utility.getPatchIndex(match.start_time)].name
    },
    {
      match_id: match.match_id
    }, cb);
  }, function (err)
  {
    process.exit(Number(err));
  });
});