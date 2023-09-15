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

function getTeamById(req, res, cb) {
  db.raw(
    `SELECT team_rating.*, teams.*
      FROM teams
      LEFT JOIN team_rating using(team_id)
      WHERE teams.team_id = ?`,
    [req.params.team_id]
  ).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return res.json(result.rows[0]);
  });
}

function getMatchesByTeamId(req, res, cb) {
  db.raw(
    `
      SELECT team_match.match_id, radiant_win, radiant_score, dire_score, team_match.radiant, duration, start_time, leagueid, leagues.name as league_name, cluster, tm2.team_id opposing_team_id, teams2.name opposing_team_name, teams2.logo_url opposing_team_logo
      FROM team_match
      JOIN matches USING(match_id)
      JOIN leagues USING(leagueid)
      JOIN team_match tm2 on team_match.match_id = tm2.match_id and team_match.team_id != tm2.team_id
      JOIN teams teams2 on tm2.team_id = teams2.team_id
      WHERE team_match.team_id = ?
      ORDER BY match_id DESC
      `,
    [req.params.team_id]
  ).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return res.json(result.rows);
  });
}

module.exports = {
  getTeamsData,
  getTeamById,
  getMatchesByTeamId,
};
