var utility = require('./utility');
var queue = require('./queue');
var addToQueue = queue.addToQueue;
var mQueue = queue.getQueue('mmr');
var rankQueue = queue.getQueue('rank');
var db = require('./db');
var getData = utility.getData;
var queries = require('./queries');
mQueue.process(20, processMmr);

function processMmr(job, cb)
{
    getData(
    {
        url: job.data.url,
        noRetry: true
    }, function(err, data)
    {
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
            queries.insertPlayerRating(db, data, function(err)
            {
                if (err)
                {
                    console.error(err);
                    return cb(err);
                }
                if (data.solo_competitive_rank)
                {
                    job.data.payload.solo_competitive_rank = data.solo_competitive_rank;
                    addToQueue(rankQueue, job.data.payload,
                    {}, cb);
                }
                else
                {
                    cb(err);
                }
            });
        }
        else
        {
            cb();
        }
    });
}
