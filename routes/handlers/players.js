const async = require("async");
const db = require("../../store/db");
const queries = require("../../store/queries");
const utility = require("../../util/utility");

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

async function getPlayersByAccountId(req, res, cb) {
    const accountId = Number(req.params.account_id);
    async.parallel(
    {
        profile(cb) {
        queries.getPlayer(db, accountId, (err, playerData) => {
            if (playerData !== null && playerData !== undefined) {
            playerData.is_contributor = utility.isContributor(accountId);
            playerData.is_subscriber = Boolean(playerData?.status);
            }
            cb(err, playerData);
        });
        },
        solo_competitive_rank(cb) {
        db.first()
            .from("solo_competitive_rank")
            .where({ account_id: accountId })
            .asCallback((err, row) => {
            cb(err, row ? row.rating : null);
            });
        },
        competitive_rank(cb) {
        db.first()
            .from("competitive_rank")
            .where({ account_id: accountId })
            .asCallback((err, row) => {
            cb(err, row ? row.rating : null);
            });
        },
        rank_tier(cb) {
        db.first()
            .from("rank_tier")
            .where({ account_id: accountId })
            .asCallback((err, row) => {
            cb(err, row ? row.rating : null);
            });
        },
        leaderboard_rank(cb) {
        db.first()
            .from("leaderboard_rank")
            .where({ account_id: accountId })
            .asCallback((err, row) => {
            cb(err, row ? row.rating : null);
            });
        },
        mmr_estimate(cb) {
        queries.getMmrEstimate(accountId, (err, est) =>
            cb(err, est || {})
        );
        },
    },
    (err, result) => {
        if (err) {
        return cb(err);
        }
        return res.json(result);
    }
    );
}

module.exports = {
  getPlayersByRank,
  getPlayersByAccountId,
};
