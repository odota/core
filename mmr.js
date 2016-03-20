var utility = require('./utility');
var queue = require('./queue');
var mQueue = queue.getQueue('mmr');
var db = require('./db');
var getData = utility.getData;
var queries = require('./queries');
var redis = require('./redis');
var config = require('./config');
var retrieverArr = config.RETRIEVER_HOST.split(",");
mQueue.process(retrieverArr.length * 10, processMmr);

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
