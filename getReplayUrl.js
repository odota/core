var db = require('./db');
var r = require('./redis');
var redis = r.client;
var utility = require('./utility');
var getData = utility.getData;
module.exports = function getReplayUrl(match, cb) {
    if (match.url) {
        //if there's already a filename or url, we don't need to retrieve
        //this is for custom jobs!
        console.log("replay url in job");
        return cb();
    }
    db.select(['url']).from('matches').where({
        match_id: match.match_id
    }).asCallback(function(err, doc) {
        if (err) {
            return cb(err);
        }
        if (doc && doc.url) {
            console.log("replay url in db");
            match.url = doc.url;
            return cb(err);
        }
        else {
            redis.get("retrievers", function(err, result) {
                if (err || !result) {
                    console.log("failed to get retrievers from redis");
                    return cb(err);
                }
                result = JSON.parse(result);
                //make array of retriever urls and use a random one on each retry
                var urls = result.map(function(r) {
                    return r + "&match_id=" + match.match_id;
                });
                getData(urls, function(err, body) {
                    if (err || !body || !body.match || !body.match.replay_salt) {
                        //non-retryable error
                        return cb("invalid body or error");
                    }
                    var url = "http://replay" + body.match.cluster + ".valve.net/570/" + match.match_id + "_" + body.match.replay_salt + ".dem.bz2";
                    match.url = url;
                    //save replay url in db
                    db('matches').update({
                        url: url
                    }).where({
                        match_id: match.match_id
                    }).asCallback(cb);
                });
            });
        }
    });
};