const db = require("../../store/db");
const queries = require("../../store/queries");
const redis = require("../../store/redis");

function getHeroBenchmarks(req, res, cb) {
  queries.getHeroBenchmarks(
    db,
    redis,
    {
      hero_id: req.query.hero_id,
    },
    (err, result) => {
      if (err) {
        return cb(err);
      }
      return res.json(result);
    }
  );
}

function getHeroRankings(req, res, cb) {
  queries.getHeroRankings(db, redis, req.query.hero_id, {}, (err, result) => {
    if (err) {
      return cb(err);
    }
    return res.json(result);
  });
}

function getHeroData(req, res, cb) {
  db.select()
    .from("heroes")
    .orderBy("id", "asc")
    .asCallback((err, result) => {
      if (err) {
        return cb(err);
      }
      return res.json(result);
    });
}

function getHeroStats(req, res, cb) {
  // fetch from cached redis value
  redis.get("heroStats", (err, result) => {
    if (err) {
      return cb(err);
    }
    return res.json(JSON.parse(result));
  });
}

function getRecentMatchesByHeroId(req, res, cb) {
  const heroId = req.params.hero_id;
  db.raw(
    `SELECT
    matches.match_id,
    matches.start_time,
    matches.duration,
    matches.radiant_win,
    matches.leagueid,
    leagues.name as league_name,
    ((player_matches.player_slot < 128) = matches.radiant_win) radiant,
    player_matches.player_slot,
    player_matches.account_id,
    player_matches.kills,
    player_matches.deaths,
    player_matches.assists
    FROM matches
    JOIN player_matches using(match_id)
    JOIN leagues using(leagueid)
    LEFT JOIN heroes on heroes.id = player_matches.hero_id
    WHERE player_matches.hero_id = ?
    ORDER BY matches.match_id DESC
    LIMIT 100`,
    [heroId]
  ).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return res.json(result.rows);
  });
}

module.exports = {
  getHeroBenchmarks,
  getHeroRankings,
  getHeroData,
  getHeroStats,
  getRecentMatchesByHeroId,
};
