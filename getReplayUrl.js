var utility = require('./utility');
var config = require('./config');
var secret = config.RETRIEVER_SECRET;
var retrieverConfig = config.RETRIEVER_HOST;
var moment = require('moment');
var getData = utility.getData;
module.exports = function getReplayUrl(db, redis, match, cb) {
    if (match.url) {
        //if there's already a url in match object, we don't need to retrieve.  Could be an external (non-valve URL)
        console.log("replay %s url in job", match.match_id);
        return cb();
    }
    db.first(['url']).from('matches').where({
        match_id: match.match_id
    }).asCallback(function(err, doc) {
        if (err) {
            return cb(err);
        }
        if (doc && doc.url) {
            console.log("replay %s url in db", match.match_id);
            match.url = doc.url;
            return cb(err);
        }
        //replay is expired, don't try to retrieve (it won't be valid anyway)
        if (match.start_time < moment().subtract(7, 'days').format('X') && !(match.leagueid > 0)) {
            console.log('replay %s expired', match.match_id);
            return cb("Replay expired");
        }
        else {
            var retrievers = retrieverConfig.split(",").map(function(r) {
                return "http://" + r + "?key=" + secret;
            });
            var result = retrievers;
            //make array of retriever urls and use a random one on each retry
            var urls = result.map(function(r) {
                return r + "&match_id=" + match.match_id;
            });
            getData(urls, function(err, body, metadata) {
                if (err || !body || !body.match || !body.match.replay_salt) {
                    //non-retryable error
                    return cb("invalid body or error");
                }
                var url = "http://replay" + body.match.cluster + ".valve.net/570/" + match.match_id + "_" + body.match.replay_salt + ".dem.bz2";
                //remove bz2 if test
                url = config.NODE_ENV === 'test' ? url.slice(0, -4) : url;
                match.url = url;
                //count retriever calls
                if (body.match.replay_salt) {
                    redis.zadd("retriever:" + metadata.hostname.split('.')[0], moment().format('X'), match.match_id);
                }
                //save replay url in db
                db('matches').update({
                    url: url
                }).where({
                    match_id: match.match_id
                }).asCallback(cb);
            });
        }
    });
};