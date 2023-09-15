const buildMatch = require("../../store/buildMatch");

async function getMatchById(req, res, cb) {
  try {
    const match = await buildMatch(req.params.match_id, req.query);
    if (!match) {
      return cb();
    }
    return res.json(match);
  } catch (err) {
    return cb(err);
  }
}

module.exports = {
  getMatchById,
};
