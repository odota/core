/**
 * Worker to fetch MMR data for players
 **/
const utility = require('../util/utility');
const queue = require('../store/queue');
const db = require('../store/db');
const queries = require('../store/queries');
const redis = require('../store/redis');
const config = require('../config');
const getData = utility.getData;

function processMmr(job, cb) {
  const accountId = job.account_id;
  redis.zrevrange('registeredRetrievers', 0, 9, (err, retrieverArr) => {
    if (err) {
      return cb(err);
    }
    getData({
      url: retrieverArr.map(r =>
        `http://${r}?key=${config.RETRIEVER_SECRET}&account_id=${accountId}`
      )[accountId % retrieverArr.length],
      noRetry: true,
    }, (err, data) => {
      if (err) {
        return cb(err);
      }
      if (data.solo_competitive_rank || data.competitive_rank) {
        data.account_id = job.account_id;
        data.match_id = job.match_id;
        data.time = new Date();
        if (data.solo_competitive_rank) {
          redis.zadd('solo_competitive_rank', data.solo_competitive_rank, data.account_id);
        }
        if (data.competitive_rank) {
          redis.zadd('competitive_rank', data.competitive_rank, data.account_id);
        }
        queries.insertPlayerRating(db, data, cb);
      } else {
        cb();
      }
    });
  });
}

redis.zcard('registeredRetrievers', (err, result) => {
  if (err) {
    return cb(err);
  }
  queue.runQueue('mmrQueue', config.MMR_PARALLELISM * Number(result), processMmr);
});
