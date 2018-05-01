/**
 * Issues a request to the retriever to get GC (Game Coordinator) data for a match
 * Calls back with an object containing the GC data
 * */
const moment = require('moment');
const utility = require('../util/utility');
const config = require('../config');
const queries = require('../store/queries');
const db = require('../store/db');
const redis = require('../store/redis');

const secret = config.RETRIEVER_SECRET;
const retrieverArr = utility.getRetrieverArr();
const { getData, redisCount } = utility;
const { insertMatch } = queries;

function getGcDataFromRetriever(match, cb) {
  // make array of retriever urls and use a random one on each retry
  let urls = retrieverArr.map(r => `http://${r}?key=${secret}&match_id=${match.match_id}`);
  if (config.NODE_ENV !== 'test' && match.allowBackup && (Math.random() * 100) < Number(config.BACKUP_RETRIEVER_PERCENT)) {
    urls = [`https://api.stratz.com/api/v1/match?matchId=${match.match_id}`];
  }
  return getData({ url: urls, noRetry: match.noRetry }, (err, body, metadata) => {
    if (metadata && metadata.hostname === 'api.stratz.com') {
      // handle backup urls (don't save to DB since no party/buffs data)
      return cb(err, {
        match_id: Number(match.match_id),
        cluster: body.results[0].clusterId,
        replay_salt: body.results[0].replaySalt,
      });
    }
    if (err || !body || !body.match || !body.match.replay_salt || !body.match.players) {
      // non-retryable error
      return cb(new Error('invalid body or error'));
    }
    // Count retriever calls
    redisCount(redis, 'retriever');
    redis.zincrby('retrieverCounts', 1, metadata.hostname);
    redis.expireat('retrieverCounts', moment().startOf('hour').add(1, 'hour').format('X'));

    // TODO add discovered account_ids to database and fetch account data/rank medal

    // Persist parties and permanent buffs
    const players = body.match.players.map(p => ({
      player_slot: p.player_slot,
      party_id: Number(p.party_id),
      permanent_buffs: p.permanent_buffs,
      party_size: body.match.players
        .filter(matchPlayer => matchPlayer.party_id === p.party_id)
        .length,
    }));
    const matchToInsert = {
      match_id: match.match_id,
      pgroup: match.pgroup,
      players,
    };
    const gcdata = {
      match_id: Number(match.match_id),
      cluster: body.match.cluster,
      replay_salt: body.match.replay_salt,
      series_id: body.match.series_id,
      series_type: body.match.series_type,
    };
    return insertMatch(matchToInsert, {
      type: 'gcdata',
      skipParse: true,
    }, (err) => {
      if (err) {
        return cb(err);
      }
      // Persist GC data to database
      return queries.upsert(db, 'match_gcdata', gcdata, {
        match_id: body.match.match_id,
      }, (err) => {
        cb(err, gcdata);
      });
    });
  });
}

module.exports = function getGcData(match, cb) {
  const matchId = match.match_id;
  if (!matchId || Number.isNaN(Number(matchId)) || Number(matchId) <= 0) {
    return cb(new Error('invalid match_id'));
  }
  return db.first().from('match_gcdata').where({
    match_id: matchId,
  }).asCallback((err, gcdata) => {
    if (err) {
      return cb(err);
    }
    if (gcdata && gcdata.replay_salt) {
      console.log('found cached replay url for %s', matchId);
      return cb(err, gcdata);
    }
    return getGcDataFromRetriever(match, cb);
  });
};
