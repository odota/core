var db = require('./db');
var moment = require('moment');
var r = require('./redis');
var redis = r.client;
var utility = require('./utility');
var getData = utility.getData;
module.exports = function getReplayUrl(match, cb) {
    db.matches.findOne({
        match_id: match.match_id
    }, function(err, doc) {
        if (err){
            return cb(err);
        }
        if (match.fileName) { 
            //if there's already a filename, we don't need a url
            //this is for custom jobs!
            //we can't just return if there is a URL since the url may be invalid (too old)
            return cb(err);
        }
        if (match.start_time < moment().subtract(7, 'days').format('X')) {
            console.log("replay expired, not getting replay url");
            return cb(err);
        }
        if (!err && doc && doc.url) {
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
                    if (err || !body || !body.match) {
                        //non-retryable error
                        return cb("invalid body or error");
                    }
                    var url = "http://replay" + body.match.cluster + ".valve.net/570/" + match.match_id + "_" + body.match.replaySalt + ".dem.bz2";
                    match.url = url;
                    //save replay url in db
                    db.matches.update({
                        match_id: match.match_id
                    }, {
                        $set: match
                    }, {
                        upsert: true
                    }, function(err) {
                        cb(err);
                    });
                });
            });
        }
    });
}