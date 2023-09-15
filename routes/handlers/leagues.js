const db = require("../../store/db");

function getLeagues(req, res, cb) {
  db.select()
    .from("leagues")
    .asCallback((err, result) => {
      if (err) {
        return cb(err);
      }
      return res.json(result);
    });
}

function getLeaguesById(req, res, cb) {
  db.raw(
    `SELECT leagues.*
      FROM leagues
      WHERE leagues.leagueid = ?`,
    [req.params.league_id]
  ).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return res.json(result.rows[0]);
  });
}

module.exports = {
  getLeagues,
  getLeaguesById,
};
