/**
 * Issues a request to the retriever to get GC (Game Coordinator) data for a match
 * Calls back with an object containing the GC data
 * */
const moment = require("moment");
const utility = require("../util/utility");
const config = require("../config");
const queries = require("../store/queries");
const db = require("../store/db");
const redis = require("../store/redis");
const { promisify } = require("util");

const secret = config.RETRIEVER_SECRET;
const { getData, redisCount } = utility;
const { insertMatch } = queries;

async function getGcDataFromRetriever(match, cb) {
  const retrieverArr = utility.getRetrieverArr(match.useGcDataArr);
  // make array of retriever urls and use a random one on each retry
  let urls = retrieverArr.map(
    (r) => `http://${r}?key=${secret}&match_id=${match.match_id}`
  );
  return getData(
    { url: urls, noRetry: match.noRetry, timeout: 5000 },
    async (err, body) => {
      if (
        err ||
        !body ||
        !body.match ||
        !body.match.replay_salt ||
        !body.match.players
      ) {
        // non-retryable error
        // redis.lpush('nonRetryable', JSON.stringify({ matchId: match.match_id, body }));
        // redis.ltrim('nonRetryable', 0, 10000);
        return cb(new Error("invalid body or error"));
      }
      // Count retriever calls
      redisCount(redis, "retriever");
      redis.zincrby("retrieverCounts", 1, 'retriever');
      redis.expireat(
        "retrieverCounts",
        moment().startOf("hour").add(1, "hour").format("X")
      );
      // TODO add discovered account_ids to database and fetch account data/rank medal
      try {
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
        await promisify(insertMatch)(matchToInsert, {
          type: "gcdata",
          skipParse: true,
        });
        // Persist GC data to database
        await promisify(queries.upsert)(db, "match_gcdata", gcdata, {
          match_id: match.match_id,
        });
        cb(null, gcdata);
      } catch (e) {
        cb(e);
      }
    }
  );
}

module.exports = async function getGcData(match, cb) {
  const matchId = match.match_id;
  if (!matchId || Number.isNaN(Number(matchId)) || Number(matchId) <= 0) {
    return cb(new Error("invalid match_id"));
  }
  // Check if we have it in DB already
  const saved = await db.raw(
    `select match_id, cluster, replay_salt from match_gcdata where match_id = ?`,
    [match.match_id]
  );
  const gcdata = saved.rows[0];
  if (gcdata) {
    console.log("found cached gcdata for %s", matchId);
    redisCount(redis, "cached_gcdata");
    return cb(null, gcdata);
  }
  getGcDataFromRetriever(match, cb);
};
