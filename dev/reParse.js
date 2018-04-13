/**
 * Load match IDs from database, then issue re-insert and re-parse on all of them
 * */
const utility = require('../util/utility');
const queries = require('../store/queries');
const db = require('../store/db');
const async = require('async');

const { generateJob, getData } = utility;
const { insertMatch } = queries;
const delay = 50;
const args = process.argv.slice(2);
const matchId = Number(args[0]) || 0;
const targetVersion = Number(args[1]) || 0;

db.select('match_id')
  .from('matches')
  .where('match_id', '>', matchId)
  .where('version', '!=', targetVersion)
  .orWhereNull('version')
  .orderBy('match_id')
  .asCallback((err, result) => {
    if (err) {
      throw err;
    }
    async.eachSeries(result, (row, cb) => {
      const job = generateJob('api_details', {
        match_id: row.match_id,
      });
      const { url } = job;
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
