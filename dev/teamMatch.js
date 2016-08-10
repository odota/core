var db = require('../store/db');
var queries = require('../store/queries');
var async = require('async');
db.select(['radiant_team_id', 'dire_team_id', 'match_id']).from('matches').asCallback(function (err, matches)
{
  if (err)
  {
    throw err;
  }
  async.eachSeries(matches, function (match, cb)
  {
    console.log(match.match_id);
    var arr = [];
    if (match.radiant_team_id)
    {
      arr.push(
      {
        team_id: match.radiant_team_id,
        match_id: match.match_id,
        radiant: true
      });
    }
    if (match.dire_team_id)
    {
      arr.push(
      {
        team_id: match.dire_team_id,
        match_id: match.match_id,
        radiant: false
      });
    }
    async.each(arr, function (tm, cb)
    {
      queries.upsert(db, 'team_match', tm,
      {
        team_id: tm.team_id,
        match_id: tm.match_id
      }, cb);
    }, cb);
  }, function (err)
  {
    process.exit(Number(err));
  });
});