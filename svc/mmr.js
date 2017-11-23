/**
 * Worker to fetch MMR data for players
 * */
const utility = require('../util/utility');
const queue = require('../store/queue');
const db = require('../store/db');
const queries = require('../store/queries');
const config = require('../config');

const getData = utility.getData;
const retrieverArr = utility.getRetrieverArr();

function processMmr(job, cb) {
  // Don't always do the job
  if (Math.random() < 0.99) {
    return cb();
  }
  const accountId = job.account_id;
  const urls = retrieverArr
    .map(r => `http://${r}?key=${config.RETRIEVER_SECRET}&account_id=${accountId}`);
  return getData({ url: urls }, (err, data) => {
    if (err) {
      return cb(err);
    }
    if (data.solo_competitive_rank || data.competitive_rank) {
      data.account_id = job.account_id;
      data.match_id = job.match_id;
      data.time = new Date();
      return queries.insertPlayerRating(db, data, cb);
    }
    return cb();
  });
}

queue.runQueue('mmrQueue', config.MMR_PARALLELISM * retrieverArr.length, processMmr);
