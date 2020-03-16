/**
 * Issues a request to the retriever to get GC (Game Coordinator) data for a match
 * Calls back with an object containing the GC data
 * */
const moment = require('moment');
const zlib = require('zlib');
const utility = require('../util/utility');
const config = require('../config');
const queries = require('../store/queries');
const db = require('../store/db');
const redis = require('../store/redis');

const secret = config.RETRIEVER_SECRET;
const { getData, redisCount } = utility;
const { insertMatch } = queries;

function handleGcData(match, body, cb) {
  // Persist parties and permanent buffs
  const players = body.match.players.map((p, i) => ({
    // As of 2019-03-05 (Mars patch) the GC is returning incorrect player_slot values. Just use the index to determine player slot for now.
    player_slot: i > 4 ? i + 123 : i,
    // player_slot: p.player_slot,
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
    series_id: body.match.series_id,
    series_type: body.match.series_type,
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
}

function getGcDataFromRetriever(match, cb) {
  const retrieverArr = utility.getRetrieverArr(match.useGcDataArr);
  // make array of retriever urls and use a random one on each retry
  let urls = retrieverArr.map(r => `http://${r}?key=${secret}&match_id=${match.match_id}`);
  if (config.NODE_ENV !== 'test' && match.allowBackup && (Math.random() * 100) < Number(config.BACKUP_RETRIEVER_PERCENT)) {
    urls = [`https://api.stratz.com/api/v1/match?matchId=${match.match_id}`];
  }
  return getData({ url: urls, noRetry: match.noRetry, timeout: 5000 }, (err, body, metadata) => {
    if (metadata && metadata.hostname === 'api.stratz.com') {
      // handle backup urls (don't save to DB since no party/buffs data)
      redisCount(redis, 'backup');
      return cb(err, {
        match_id: Number(match.match_id),
        cluster: body[0].clusterId,
        replay_salt: body[0].replaySalt,
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

    redis.setex(`gcdata:${match.match_id}`, 60 * 60 * 36, zlib.gzipSync(JSON.stringify(body)));
    // TODO add discovered account_ids to database and fetch account data/rank medal
    return handleGcData(match, body, cb);
  });
}

module.exports = function getGcData(match, cb) {
  const matchId = match.match_id;
  if (!matchId || Number.isNaN(Number(matchId)) || Number(matchId) <= 0) {
    return cb(new Error('invalid match_id'));
  }
  return redis.get(Buffer.from(`gcdata:${match.match_id}`), (err, body) => {
    if (err) {
      return cb(err);
    }
    if (body) {
      return handleGcData(match, JSON.parse(zlib.gunzipSync(body)), cb);
    }
    return getGcDataFromRetriever(match, cb);
  });
};
