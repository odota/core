const db = require("../../store/db");

function getTeamsData(req, res, cb) {
  db.raw(
    `SELECT team_rating.*, teams.*
      FROM teams
      LEFT JOIN team_rating using(team_id)
      ORDER BY rating desc NULLS LAST
      LIMIT 1000
      OFFSET ?`,
    [(Number(req.query.page) || 0) * 1000]
  ).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return res.json(result.rows);
  });
}

module.exports = {
  getTeamsData,
};
