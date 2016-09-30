/**
 * Worker to fetch MMR data for players
 **/
const utility = require('../util/utility');
const queue = require('../store/queue');
const db = require('../store/db');
const queries = require('../store/queries');
const redis = require('../store/redis');
const config = require('../config');
const mQueue = queue.getQueue('mmr');
const getData = utility.getData;
const retrieverArr = config.RETRIEVER_HOST.split(',');
mQueue.process(retrieverArr.length * config.MMR_PARALLELISM, processMmr);
mQueue.on('completed', (job) => {
  job.remove();
});
mQueue.on('failed', (job) => {
  job.remove();
});

function processMmr(job, cb)
{
  const account_id = job.data.payload.account_id;
  getData(
    {
      url: retrieverArr.map((r) => {
        return 'http://' + r + '?key=' + config.RETRIEVER_SECRET + '&account_id=' + account_id;
      })[account_id % retrieverArr.length],
      noRetry: true,
    }, (err, data) => {
    if (err)
        {
      console.error(err);
      return cb(err);
    }
    if (data.solo_competitive_rank || data.competitive_rank)
        {
      data.account_id = job.data.payload.account_id;
      data.match_id = job.data.payload.match_id;
      data.time = new Date();
      if (data.solo_competitive_rank)
            {
        redis.zadd('solo_competitive_rank', data.solo_competitive_rank, data.account_id);
      }
      if (data.competitive_rank)
            {
        redis.zadd('competitive_rank', data.competitive_rank, data.account_id);
      }
      queries.insertPlayerRating(db, data, (err) => {
        if (err)
                {
          console.error(err);
        }
        return cb(err);
      });
    }
    else
        {
      cb();
    }
  });
}
