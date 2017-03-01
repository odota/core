/**
 * Issues a request to the retriever to get GC (Game Coordinator) data for a match
 * Calls back with an object containing the GC data
 **/
const moment = require('moment');
const utility = require('../util/utility');
const config = require('../config');
const queries = require('../store/queries');

const secret = config.RETRIEVER_SECRET;
const retrieverArr = utility.getRetrieverArr();
const getData = utility.getData;
const insertMatch = queries.insertMatch;

module.exports = function getGcData(db, redis, match, cb) {
  db.first().from('match_gcdata').where({
    match_id: match.match_id,
  }).asCallback((err, gcdata) => {
    if (err) {
      return cb(err);
    }
    if (gcdata && gcdata.replay_salt) {
      console.log('found cached replay url for %s', match.match_id);
      return cb(err, gcdata);
    }
    // make array of retriever urls and use a random one on each retry
    const urls = retrieverArr.map(r =>
      `http://${r}?key=${secret}&match_id=${match.match_id}`
    );
    return getData(urls, (err, body, metadata) => {
      if (err || !body || !body.match || !body.match.replay_salt || !body.match.players) {
        // non-retryable error
        return cb('invalid body or error');
      }
      // count retriever calls
      redis.zadd('retriever', moment().format('X'), `${metadata.hostname}_${match.match_id}`);
      // Persist parties and permanent buffs
      const players = body.match.players.map(p => ({
        player_slot: p.player_slot,
        party_id: Number(p.party_id),
        permanent_buffs: p.permanent_buffs,
      }));
      const matchToInsert = {
        match_id: match.match_id,
        players,
      };
      return insertMatch(matchToInsert, {
        type: 'gcdata',
        skipParse: true,
      }, (err) => {
        if (err) {
          return cb(err);
        }
        // Persist GC data to database
        return queries.upsert(db, 'match_gcdata', {
          match_id: match.match_id,
          cluster: body.match.cluster,
          replay_salt: body.match.replay_salt,
          series_id: body.match.series_id,
          series_type: body.match.series_type,
        }, {
          match_id: body.match.match_id,
        }, (err) => {
          cb(err, {
            match_id: match.match_id,
            cluster: body.match.cluster,
            replay_salt: body.match.replay_salt,
          });
        });
      });
    });
  });
};
