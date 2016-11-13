const db = require('../store/db');
const queries = require('../store/queries');
const async = require('async');

db.select(['radiant_team_id', 'dire_team_id', 'match_id']).from('matches').asCallback((err, matches) => {
  if (err) {
    throw err;
  }
  async.eachSeries(matches, (match, cb) => {
    console.log(match.match_id);
    const arr = [];
    if (match.radiant_team_id) {
      arr.push(
        {
          team_id: match.radiant_team_id,
          match_id: match.match_id,
          radiant: true,
        });
    }
    if (match.dire_team_id) {
      arr.push(
        {
          team_id: match.dire_team_id,
          match_id: match.match_id,
          radiant: false,
        });
    }
    async.each(arr, (tm, cb) => {
      queries.upsert(db, 'team_match', tm,
        {
          team_id: tm.team_id,
          match_id: tm.match_id,
        }, cb);
    }, cb);
  }, (err) => {
    process.exit(Number(err));
  });
});
