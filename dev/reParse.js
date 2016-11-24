/**
 * Load match IDs from database, then issue re-insert and re-parse on all of them
 **/
const utility = require('../util/utility');
const queries = require('../store/queries');
const db = require('../store/db');
const async = require('async');

const generateJob = utility.generateJob;
const getData = utility.getData;
const insertMatch = queries.insertMatch;
const delay = 100;

db.select('match_id').from('matches').asCallback((err, result) => {
  if (err) {
    throw err;
  }
  async.eachSeries(result, (row, cb) => {
    const job = generateJob('api_details', {
      match_id: row.match_id,
    });
    const url = job.url;
    getData({
      url,
      delay,
    }, (err, body) => {
      if (err) {
        throw err;
      }
      if (body.result) {
        const match = body.result;
        insertMatch(match, {
          skipCounts: true,
          forceParse: true,
          attempts: 1,
        }, (err) => {
          if (err) {
            throw err;
          }
          cb(err);
        });
      } else {
        throw body;
      }
    });
  }, (err) => {
    process.exit(Number(err));
  });
});
