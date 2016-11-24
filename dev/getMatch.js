/**
 * Load a single match by ID from the steam API, insert, and request a parse
 **/
const utility = require('../util/utility');
const queries = require('../store/queries');

const generateJob = utility.generateJob;
const getData = utility.getData;
const insertMatch = queries.insertMatch;
const args = process.argv.slice(2);
const matchId = Number(args[0]);
const delay = 1000;
const job = generateJob('api_details', {
  match_id: matchId,
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
      process.exit(0);
    });
  } else {
    throw body;
  }
});
