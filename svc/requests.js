/**
 * Worker to process parse requests submitted by users
 **/
const config = require('../config');
const utility = require('../util/utility');
const redis = require('../store/redis');
const db = require('../store/db');
const cassandra = config.ENABLE_CASSANDRA_MATCH_STORE_WRITE ? require('../store/cassandra') : undefined;
const queue = require('../store/queue');
const queries = require('../store/queries');
const getData = utility.getData;
const pQueue = queue.getQueue('parse');
const rQueue = queue.getQueue('request');
const insertMatch = queries.insertMatch;
rQueue.process(100, processRequest);

function processRequest(job, cb)
{
  const payload = job.data.payload;
  if (payload.match_id)
    {
        // request match id, get data from API
    getData(job.data.url, (err, body) => {
      if (err)
            {
                // couldn't get data from api, non-retryable
        return cb(JSON.stringify(err));
      }
            // match details response
      const match = body.result;
      insertMatch(db, redis, match,
        {
          type: 'api',
          attempts: 1,
          lifo: true,
          cassandra,
          forceParse: true,
        }, waitParse);
    });
  }
  else
    {
        // direct upload
    queue.addToQueue(pQueue, payload,
      {
        attempts: 1,
      }, waitParse);
  }

  function waitParse(err, job2)
    {
    if (err)
        {
      console.error(err.stack || err);
      return cb(err);
    }
        // job2 is the parse job
    if (job.data.request && job2)
        {
      const poll = setInterval(() => {
        return pQueue.getJob(job2.jobId).then((job2) => {
          job.progress(job2.progress());
          return job2.getState().then((state) => {
            console.log('waiting for parse job %s, currently in %s', job2.jobId, state);
            if (state === 'completed')
                        {
              clearInterval(poll);
              return cb();
            }
            else if (state !== 'active' && state !== 'waiting')
                        {
              clearInterval(poll);
              return cb('failed');
            }
          }).catch(cb);
        }).catch(cb);
      }, 2000);
    }
    else
        {
      console.error(err);
      cb(err);
    }
  }
}
