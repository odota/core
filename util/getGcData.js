/**
 * Issues a request to the retriever to get GC (Game Coordinator) data for a match
 * Calls back with an object containing the GC data
 * */
const moment = require('moment');
const utility = require('./utility');
const config = require('../config');
const queries = require('../store/queries');
const db = require('../store/db');
const redis = require('../store/redis');

const secret = config.RETRIEVER_SECRET;
const { getDataPromise, redisCount } = utility;
const { insertMatchPromise, upsertPromise } = queries;

async function getGcDataFromRetriever(match) {
  const retrieverArr = utility.getRetrieverArr(match.useGcDataArr);
  // make array of retriever urls and use a random one on each retry
  const urls = retrieverArr.map(
    (r) => `http://${r}?key=${secret}&match_id=${match.match_id}`
  );
  const body = await getDataPromise({ url: urls, noRetry: match.noRetry, timeout: 5000 });
  if (
    !body ||
    !body.match ||
    !body.match.replay_salt ||
    !body.match.players
  ) {
    // non-retryable error
    // redis.lpush('nonRetryable', JSON.stringify({ matchId: match.match_id, body }));
    // redis.ltrim('nonRetryable', 0, 10000);
    throw new Error('invalid body');
  }
  // Count retriever calls
  redisCount(redis, 'retriever');
  redis.zincrby('retrieverCounts', 1, 'retriever');
  redis.expireat(
    'retrieverCounts',
    moment().startOf('hour').add(1, 'hour').format('X')
  );
  // TODO (howard) add discovered account_ids to database and fetch account data/rank medal
  // NOTE: extra player fields won't be set on repeated parses unless we manually delete match_gcdata row
  // if someone requests a reparse we won't have this data 
  const players = body.match.players.map((p, i) => ({
    player_slot: p.player_slot,
    party_id: p.party_id?.low,
    permanent_buffs: p.permanent_buffs,
    party_size: body.match.players.filter(
      (matchPlayer) => matchPlayer.party_id?.low === p.party_id?.low
    ).length,
    net_worth: p.net_worth,
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
  };
  // Put extra fields in matches/player_matches
  await insertMatchPromise(matchToInsert, {
    type: 'gcdata',
    skipParse: true,
  });
  // Persist GC data to database
  await upsertPromise(db, 'match_gcdata', gcdata, {
    match_id: match.match_id,
  });
  return gcdata;
}

module.exports = async function getGcData(match) {
  const matchId = match.match_id;
  if (!matchId || Number.isNaN(Number(matchId)) || Number(matchId) <= 0) {
    throw new Error('invalid match_id');
  }
  // Check if we have it in DB already
  const saved = await db.raw(
    'select match_id, cluster, replay_salt from match_gcdata where match_id = ?',
    [match.match_id]
  );
  const gcdata = saved.rows[0];
  if (gcdata) {
    // console.log('found cached gcdata for %s', matchId);
    redisCount(redis, 'cached_gcdata');
    return gcdata;
  }
  return await getGcDataFromRetriever(match);
};
