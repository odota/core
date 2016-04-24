var utility = require('../util/utility');
var config = require('../config');
var secret = config.RETRIEVER_SECRET;
var retrieverConfig = config.RETRIEVER_HOST;
var moment = require('moment');
var getData = utility.getData;
module.exports = function getReplayUrl(db, redis, match, cb)
{
    if (match.url)
    {
        //if there's already a url in match object, we don't need to retrieve.  Could be an external (non-valve URL)
        console.log("replay %s url in job", match.match_id);
        return cb();
    }
    redis.get('replay_url:' + match.match_id, function(err, replay_url)
    {
        if (err)
        {
            return cb(err);
        }
        if (replay_url)
        {
            console.log("replay %s url saved", match.match_id);
            match.url = replay_url;
            return cb(err);
        }
        else
        {
            var retrievers = retrieverConfig.split(",").map(function(r)
            {
                return "http://" + r + "?key=" + secret;
            });
            var result = retrievers;
            //make array of retriever urls and use a random one on each retry
            var urls = result.map(function(r)
            {
                return r + "&match_id=" + match.match_id;
            });
            getData(urls, function(err, body, metadata)
            {
                if (err || !body || !body.match || !body.match.replay_salt)
                {
                    //non-retryable error
                    return cb("invalid body or error");
                }
                var url = "http://replay" + body.match.cluster + ".valve.net/570/" + match.match_id + "_" + body.match.replay_salt + ".dem.bz2";
                //remove bz2 if test
                url = config.NODE_ENV === 'test' ? url.slice(0, -4) : url;
                match.url = url;
                //count retriever calls
                if (body.match.replay_salt)
                {
                    redis.zadd("retriever:" + metadata.hostname.split('.')[0], moment().format('X'), match.match_id);
                    redis.setex('replay_url:'+match.match_id, 86400, url);
                }
                return cb(err);
            });
        }
    });
};