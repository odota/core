var express = require('express');
var router = express.Router();
var config = require('../config');
var request = require('request');
var rc_public = config.RECAPTCHA_PUBLIC_KEY;
var rc_secret = config.RECAPTCHA_SECRET_KEY;
var multer = require('multer')(
{
    inMemory: true,
    fileSize: 100 * 1024 * 1024, // no larger than 100mb
});
var utility = require('../utility');
var queueReq = utility.queueReq;
var queue = require('../queue');
module.exports = function(db, redis)
{
    router.route('/request').get(function(req, res)
    {
        res.render('request',
        {
            rc_public: rc_public
        });
    });
    router.route('/request_job').post(multer.single("replay_blob"), function(req, res, next)
    {
        request.post("https://www.google.com/recaptcha/api/siteverify",
        {
            form:
            {
                secret: rc_secret,
                response: req.body.response
            }
        }, function(err, resp, body)
        {
            if (err)
            {
                return next(err);
            }
            try
            {
                body = JSON.parse(body);
            }
            catch (err)
            {
                return res.render(
                {
                    error: err
                });
            }
            var match_id = Number(req.body.match_id);
            var match;
            if (!body.success && config.ENABLE_RECAPTCHA)
            {
                console.log('failed recaptcha');
                res.json(
                {
                    error: "Recaptcha Failed!"
                });
            }
            else if (req.file)
            {
                console.log(req.file);
                var key = req.file.originalname + Date.now();
                redis.setex(new Buffer('upload_blob:' + key), 60 * 60, req.file.buffer);
                match = {
                    replay_blob_key: key
                };
            }
            else if (match_id && !isNaN(match_id))
            {
                match = {
                    match_id: match_id
                };
            }
            if (match)
            {
                console.log(match);
                queueReq(queue, "request", match,
                {
                    attempts: 1
                }, function(err, job)
                {
                    res.json(
                    {
                        error: err,
                        job:
                        {
                            jobId: job.jobId,
                            data: job.data
                        }
                    });
                });
            }
            else
            {
                res.json(
                {
                    error: "Invalid input."
                });
            }
        });
    }).get(function(req, res, next)
    {
        queue.request.getJob(req.query.id).then(function(job)
        {
            if (job)
            {
                job.getState().then(function(state)
                {
                    return res.json(
                    {
                        jobId: job.jobId,
                        data: job.data,
                        state: state
                    });
                }).catch(next);
            }
            else
            {
                res.json(
                {
                    state: "failed"
                });
            }
        }).catch(next);
    });
    return router;
};