const async = require("async");
const cacheFunctions = require("../../store/cacheFunctions");
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

async function getPlayersByAccountIdWl(req, res, cb) {
  const result = {
    win: 0,
    lose: 0,
  };
  req.queryObj.project = req.queryObj.project.concat(
    "player_slot",
    "radiant_win"
  );
  queries.getPlayerMatches(
    req.params.account_id,
    req.queryObj,
    (err, cache) => {
      if (err) {
        return cb(err);
      }
      cache.forEach((m) => {
        if (utility.isRadiant(m) === m.radiant_win) {
          result.win += 1;
        } else {
          result.lose += 1;
        }
      });
      return cacheFunctions.sendDataWithCache(req, res, result, "wl");
    }
  );
}

async function getPlayersByAccountIdRecentMatches(req, res, cb) {
  queries.getPlayerMatches(
    req.params.account_id,
    {
      project: req.queryObj.project.concat([
        "hero_id",
        "start_time",
        "duration",
        "player_slot",
        "radiant_win",
        "game_mode",
        "lobby_type",
        "version",
        "kills",
        "deaths",
        "assists",
        "skill",
        "average_rank",
        "xp_per_min",
        "gold_per_min",
        "hero_damage",
        "tower_damage",
        "hero_healing",
        "last_hits",
        "lane",
        "lane_role",
        "is_roaming",
        "cluster",
        "leaver_status",
        "party_size",
      ]),
      dbLimit: 20,
    },
    (err, cache) => {
      if (err) {
        return cb(err);
      }
      return res.json(cache.filter((match) => match.duration));
    }
  );
}

async function getPlayersByAccountIdMatches(req, res, cb) {
  // Use passed fields as additional fields, if available
  const additionalFields = req.query.project || [
    "hero_id",
    "start_time",
    "duration",
    "player_slot",
    "radiant_win",
    "game_mode",
    "lobby_type",
    "version",
    "kills",
    "deaths",
    "assists",
    "skill",
    "average_rank",
    "leaver_status",
    "party_size",
  ];
  req.queryObj.project = req.queryObj.project.concat(additionalFields);
  queries.getPlayerMatches(
    req.params.account_id,
    req.queryObj,
    (err, cache) => {
      if (err) {
        return cb(err);
      }
      return res.json(cache);
    }
  );
}

module.exports = {
  getPlayersByRank,
  getPlayersByAccountId,
  getPlayersByAccountIdWl,
};
