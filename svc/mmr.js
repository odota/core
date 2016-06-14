/**
 * Worker to fetch MMR data for players
 **/
var utility = require('../util/utility');
var queue = require('../store/queue');
var db = require('../store/db');
var queries = require('../store/queries');
var redis = require('../store/redis');
var config = require('../config');
var mQueue = queue.getQueue('mmr');
var getData = utility.getData;
var retrieverArr = config.RETRIEVER_HOST.split(",");
mQueue.process(retrieverArr.length * config.MMR_PARALLELISM, processMmr);
mQueue.on('completed', function(job)
{
    job.remove();
});

function processMmr(job, cb)
{
    var account_id = job.data.payload.account_id;
    getData(
    {
        url: retrieverArr.map(function(r)
        {
            return "http://" + r + "?key=" + config.RETRIEVER_SECRET + "&account_id=" + account_id;
        })[account_id % retrieverArr.length],
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
            if (data.solo_competitive_rank)
            {
                redis.zadd('solo_competitive_rank', data.solo_competitive_rank, data.account_id);
            }
            if (data.competitive_rank)
            {
                redis.zadd('competitive_rank', data.competitive_rank, data.account_id);
            }
            queries.insertPlayerRating(db, data, function(err)
            {
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
