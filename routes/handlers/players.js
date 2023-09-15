const db = require("../../store/db");

async function getPlayersByRank(req, res, cb) {
  try {
    const result = await db.raw(
      `
      SELECT account_id, rating, fh_unavailable
      FROM players
      JOIN rank_tier
      USING (account_id)
      ORDER BY rating DESC
      LIMIT 100
      `,
      []
    );
    return res.json(result.rows);
  } catch (err) {
    return cb(err);
  }
}

module.exports = {
  getPlayersByRank,
};
