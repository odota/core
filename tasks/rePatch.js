const db = require('../store/db');
const queries = require('../store/queries');
const async = require('async');
const constants = require('dotaconstants');
const utility = require('../util/utility');
db.select(['match_id', 'start_time']).from('matches').asCallback((err, match_ids) => {
  if (err)
  {
    throw err;
  }
  async.eachSeries(match_ids, (match, cb) => {
    console.log(match.match_id);
    queries.upsert(db, 'match_patch',
      {
        match_id: match.match_id,
        patch: constants.patch[utility.getPatchIndex(match.start_time)].name,
      },
      {
        match_id: match.match_id,
      }, cb);
  }, (err) => {
    process.exit(Number(err));
  });
});
