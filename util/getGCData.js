/**
 * Issues a request to the retriever to get GC (Game Coordinator) data for a match
 **/
var utility = require('../util/utility');
var config = require('../config');
var secret = config.RETRIEVER_SECRET;
var retrieverConfig = config.RETRIEVER_HOST;
var moment = require('moment');
var getData = utility.getData;
var queries = require('../store/queries');
var buildReplayUrl = utility.buildReplayUrl;
module.exports = function getGCData(db, redis, match, cb)
{
    db.first().from('match_gcdata').where(
    {
        match_id: match.match_id
    }).asCallback(function (err, gcdata)
    {
        if (err)
        {
            return cb(err);
        }
        if (gcdata && gcdata.replay_salt)
        {
            console.log("found cached replay url for %s", match.match_id);
            match.url = buildReplayUrl(gcdata.match_id, gcdata.cluster, gcdata.replay_salt);
            return cb(err);
        }
        else
        {
            var retrievers = retrieverConfig.split(",").map(function (r)
            {
                return "http://" + r + "?key=" + secret;
            });
            var result = retrievers;
            //make array of retriever urls and use a random one on each retry
            var urls = result.map(function (r)
            {
                return r + "&match_id=" + match.match_id;
            });
            getData(urls, function (err, body, metadata)
            {
                if (err || !body || !body.match || !body.match.replay_salt)
                {
                    //non-retryable error
                    return cb("invalid body or error");
                }
                //count retriever calls
                redis.zadd("retriever:" + metadata.hostname.split('.')[0], moment().format('X'), match.match_id);
                match.url = buildReplayUrl(match.match_id, body.match.cluster, body.match.replay_salt);
                const parties = {};
                if (body.match.players)
                {
                    body.match.players.forEach(function (p)
                    {
                        if (p.party_id)
                        {
                            parties[p.player_slot] = p.party_id.low;
                        }
                    });
                }
                // Persist GC data to database
                queries.upsert(db, 'match_gcdata',
                {
                    match_id: match.match_id,
                    cluster: body.match.cluster,
                    replay_salt: body.match.replay_salt,
                    series_id: body.match.series_id,
                    series_type: body.match.series_type,
                    parties: parties,
                },
                {
                    match_id: body.match.match_id
                }, cb);
            });
        }
    });
};
