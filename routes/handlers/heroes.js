const db = require("../../store/db");
const queries = require("../../store/queries");
const redis = require("../../store/redis");

function getHeroRankings(req, res, cb) {
  queries.getHeroRankings(db, redis, req.query.hero_id, {}, (err, result) => {
    if (err) {
      return cb(err);
    }
    return res.json(result);
  });
}

module.exports = {
  getHeroRankings,
};
