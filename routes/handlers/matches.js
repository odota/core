const buildMatch = require("../../store/buildMatch");
const db = require("../../store/db");

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

function getProMatches(req, res, cb) {
  db.raw(
    `
  SELECT match_id, duration, start_time,
  radiant_team_id, radiant.name as radiant_name,
  dire_team_id, dire.name as dire_name,
  leagueid, leagues.name as league_name,
  series_id, series_type,
  radiant_score, dire_score,
  radiant_win
  FROM matches
  LEFT JOIN teams radiant
  ON radiant.team_id = matches.radiant_team_id
  LEFT JOIN teams dire
  ON dire.team_id = matches.dire_team_id
  LEFT JOIN leagues USING(leagueid)
  WHERE match_id < ?
  ORDER BY match_id DESC
  LIMIT 100
  `,
    [req.query.less_than_match_id || Number.MAX_SAFE_INTEGER]
  ).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return res.json(result.rows);
  });
}

module.exports = {
  getMatchById,
  getProMatches,
};
