/**
 * Worker to process parse requests submitted by users
 **/
var config = require('../config');
var utility = require('../util/utility');
var redis = require('../store/redis');
var db = require('../store/db');
var cassandra = config.ENABLE_CASSANDRA_MATCH_STORE_WRITE ? require('../store/cassandra') : undefined;
var queue = require('../store/queue');
var queries = require('../store/queries');
var getData = utility.getData;
var pQueue = queue.getQueue('parse');
var rQueue = queue.getQueue('request');
var insertMatch = queries.insertMatch;
rQueue.process(100, processRequest);

function processRequest(job, cb)
{
    var payload = job.data.payload;
    if (payload.match_id)
    {
        //request match id, get data from API
        getData(job.data.url, function(err, body)
        {
            if (err)
            {
                //couldn't get data from api, non-retryable
                return cb(JSON.stringify(err));
            }
            //match details response
            var match = body.result;
            match.parse_status = 0;
            insertMatch(db, redis, match,
            {
                type: "api",
                attempts: 1,
                lifo: true,
                cassandra: cassandra,
            }, waitParse);
        });
    }
    else
    {
        //direct upload
        queue.addToQueue(pQueue, payload,
        {
            attempts: 1
        }, waitParse);
    }

    function waitParse(err, job2)
    {
        if (err)
        {
            console.error(err.stack || err);
            return cb(err);
        }
        //job2 is the parse job
        if (job.data.request && job2)
        {
            var poll = setInterval(function()
            {
                pQueue.getJob(job2.jobId).then(function(job2)
                {
                    job.progress(job2.progress());
                    job2.getState().then(function(state)
                    {
                        console.log("waiting for parse job %s, currently in %s", job2.jobId, state);
                        if (state === "completed")
                        {
                            clearInterval(poll);
                            return cb();
                        }
                        else if (state !== "active" && state !== "waiting")
                        {
                            clearInterval(poll);
                            return cb("failed");
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
