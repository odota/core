/**
 * Issues a request to the retriever to get GC (Game Coordinator) data for a match
 * Calls back with an object containing the GC data
 **/
const utility = require('../util/utility');
const config = require('../config');
const secret = config.RETRIEVER_SECRET;
const retrieverConfig = config.RETRIEVER_HOST;
const moment = require('moment');
const getData = utility.getData;
const queries = require('../store/queries');
const buildReplayUrl = utility.buildReplayUrl;
module.exports = function getGcData(db, redis, match, cb) {
  db.first().from('match_gcdata').where({
    match_id: match.match_id,
  }).asCallback((err, gcdata) => {
    if (err) {
      return cb(err);
    }
    if (gcdata && gcdata.replay_salt) {
      console.log('found cached replay url for %s', match.match_id);
      const url = buildReplayUrl(gcdata.match_id, gcdata.cluster, gcdata.replay_salt);
      return cb(err, {
        url
      });
    } else {
      const retrievers = retrieverConfig.split(',').map((r) => {
        return `http://${r}?key=${secret}`;
      });
      // make array of retriever urls and use a random one on each retry
      const urls = retrievers.map((r) => {
        return `${r}&match_id=${match.match_id}`;
      });
      getData(urls, (err, body, metadata) => {
        if (err || !body || !body.match || !body.match.replay_salt) {
          // non-retryable error
          return cb('invalid body or error');
        }
        // count retriever calls
        redis.zadd('retriever', moment().format('X'), `${metadata.hostname}_${match.match_id}`);
        const url = buildReplayUrl(match.match_id, body.match.cluster, body.match.replay_salt);
        const parties = {};
        if (body.match.players) {
          body.match.players.forEach((p) => {
            if (p.party_id) {
              parties[p.player_slot] = p.party_id.low;
            }
          });
        }
        // Persist GC data to database
        queries.upsert(db, 'match_gcdata', {
          match_id: match.match_id,
          cluster: body.match.cluster,
          replay_salt: body.match.replay_salt,
          series_id: body.match.series_id,
          series_type: body.match.series_type,
        }, {
          match_id: body.match.match_id,
        }, (err) => {
          cb(err, {
            url,
            parties,
          });
        });
      });
    }
  });
};
