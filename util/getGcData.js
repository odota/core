/**
 * Issues a request to the retriever to get GC (Game Coordinator) data for a match
 * Calls back with an object containing the GC data
 **/
const utility = require('../util/utility');
const config = require('../config');
const secret = config.RETRIEVER_SECRET;
const moment = require('moment');
const getData = utility.getData;
const queries = require('../store/queries');
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
    } else {
      // TODO what if all the retrievers are bad?  This won't finish
      // TODO remove expired retrievers from config
      redis.zrevrange('registeredRetrievers', 0, 9, (err, retrieverArr) => {
        if (err) {
          return cb(err);
        }
        // make array of retriever urls and use a random one on each retry
        const retrievers = retrieverArr.map(r =>
          `http://${r}?key=${secret}&match_id=${match.match_id}`
        );
        getData(urls, (err, body, metadata) => {
          if (err || !body || !body.match || !body.match.replay_salt || !body.match.players) {
            // non-retryable error
            return cb('invalid body or error');
          }
          // count retriever calls
          redis.zadd('retriever', moment().format('X'), `${metadata.hostname}_${match.match_id}`);
          // Persist parties and permanent buffs
          const players = body.match.players.map(p => ({
            player_slot: p.player_slot,
            party_id: p.party_id && p.party_id.low,
            permanent_buffs: p.permanent_buffs,
          }));
          const matchToInsert = {
            match_id: match.match_id,
            players,
          };
          insertMatch(matchToInsert, {
            type: 'gcdata',
            skipParse: true,
          }, (err) => {
            if (err) {
              return cb(err);
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
                match_id: match.match_id,
                cluster: body.match.cluster,
                replay_salt: body.match.replay_salt,
              });
            });
          });
        });
      });
    }
  });
};
