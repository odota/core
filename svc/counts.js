/**
 * Worker to update counts based on incoming match data
 * */
const async = require('async');
const moment = require('moment');
const redis = require('../store/redis');
const db = require('../store/db');
const utility = require('../util/utility');
const benchmarks = require('../util/benchmarks');
const queries = require('../store/queries');
const queue = require('../store/queue');
const config = require('../config');

const {
  getMatchRankTier, getMatchRating, upsert, insertPlayer,
} = queries;
const { getAnonymousAccountId, isRadiant, isSignificant } = utility;

function updateHeroRankings(match, cb) {
  getMatchRankTier(match, (err, avg) => {
    if (err) {
      return cb(err);
    }
    const matchScore = (avg && !Number.isNaN(Number(avg))) ?
      avg * 100 :
      undefined;
    if (!matchScore) {
      return cb();
    }
    return async.each(match.players, (player, cb) => {
      if (!player.account_id || player.account_id === getAnonymousAccountId()) {
        return cb();
      }
      player.radiant_win = match.radiant_win;
      // Treat the result as an Elo rating change where the opponent is the average rank tier of the match * 100
      const win = Number(isRadiant(player) === player.radiant_win);
      const kFactor = 100;
      return db.select('score').from('hero_ranking').where({ account_id: player.account_id, hero_id: player.hero_id }).asCallback((err, data1) => {
        if (err) {
          return cb(err);
        }
        const currRating1 = Number((data1 && data1[0] && data1[0].score) || 4000);
        const r1 = 10 ** (currRating1 / 1000);
        const r2 = 10 ** (matchScore / 1000);
        const e1 = r1 / (r1 + r2);
        const ratingDiff1 = kFactor * (win - e1);
        const newScore = currRating1 + ratingDiff1;
        return db.raw('INSERT INTO hero_ranking VALUES(?, ?, ?) ON CONFLICT(account_id, hero_id) DO UPDATE SET score = ?', [player.account_id, player.hero_id, newScore, newScore]).asCallback(cb);
      });
    }, cb);
  });
}

function updateBenchmarks(match, cb) {
  for (let i = 0; i < match.players.length; i += 1) {
    const p = match.players[i];
    // only do if all players have heroes
    if (p.hero_id) {
      Object.keys(benchmarks).forEach((key) => {
        const metric = benchmarks[key](match, p);
        if (metric !== undefined && metric !== null && !Number.isNaN(Number(metric))) {
          const rkey = [
            'benchmarks',
            utility.getStartOfBlockMinutes(config.BENCHMARK_RETENTION_MINUTES, 0),
            key,
            p.hero_id,
          ].join(':');
          redis.zadd(rkey, metric, match.match_id);
          // expire at time two epochs later (after prev/current cycle)
          const expiretime = utility.getStartOfBlockMinutes(config.BENCHMARK_RETENTION_MINUTES, 2);
          redis.expireat(rkey, expiretime);
        }
      });
    }
  }
  return cb();
}

function updateMmrEstimate(match, cb) {
  getMatchRating(match, (err, avg) => {
    if (avg && !Number.isNaN(Number(avg))) {
      return async.each(match.players, (player, cb) => {
        if (player.account_id && player.account_id !== utility.getAnonymousAccountId()) {
          return db.raw(`
          INSERT INTO mmr_estimates VALUES(?, ?)
          ON CONFLICT(account_id)
          DO UPDATE SET estimate = mmr_estimates.estimate - (mmr_estimates.estimate / 20) + (? / 20)`, [player.account_id, avg, avg]).asCallback(cb);
        }
        return cb();
      }, cb);
    }
    return cb(err);
  });
}

function upsertMatchSample(match, cb) {
  return getMatchRating(match, (err, avg, num) => {
    if (err) {
      return cb(err);
    }
    return getMatchRankTier(match, (err, avgRankTier, numRankTier) => {
      if (err) {
        return cb(err);
      }
      if (!avgRankTier || numRankTier < 2) {
        return cb();
      }
      return db.transaction((trx) => {
        function upsertMatchSample(cb) {
          const matchMmrData = {
            avg_mmr: avg || null,
            num_mmr: num || null,
            avg_rank_tier: avgRankTier || null,
            num_rank_tier: numRankTier || null,
          };
          const newMatch = Object.assign({}, match, matchMmrData);
          return upsert(trx, 'public_matches', newMatch, {
            match_id: newMatch.match_id,
          }, cb);
        }

        function upsertPlayerMatchesSample(cb) {
          async.each(match.players || [], (pm, cb) => {
            pm.match_id = match.match_id;
            upsert(trx, 'public_player_matches', pm, {
              match_id: pm.match_id,
              player_slot: pm.player_slot,
            }, cb);
          }, cb);
        }

        function exit(err) {
          if (err) {
            console.error(err);
            trx.rollback(err);
          } else {
            trx.commit();
          }
          cb(err);
        }

        async.series({
          upsertMatchSample,
          upsertPlayerMatchesSample,
        }, exit);
      });
    });
  });
}

function updateRecord(field, match, player) {
  redis.zadd(`records:${field}`, match[field] || player[field], [match.match_id, match.start_time, player.hero_id].join(':'));
  // Keep only 100 top scores
  redis.zremrangebyrank(`records:${field}`, '0', '-101');
  const expire = moment().add(1, 'month').startOf('month').format('X');
  redis.expireat(`records:${field}`, expire);
}

function updateRecords(match, cb) {
  updateRecord('duration', match, {});
  match.players.forEach((player) => {
    updateRecord('kills', match, player);
    updateRecord('deaths', match, player);
    updateRecord('assists', match, player);
    updateRecord('last_hits', match, player);
    updateRecord('denies', match, player);
    updateRecord('gold_per_min', match, player);
    updateRecord('xp_per_min', match, player);
    updateRecord('hero_damage', match, player);
    updateRecord('tower_damage', match, player);
    updateRecord('hero_healing', match, player);
  });
  cb();
}

function updateLastPlayed(match, cb) {
  const filteredPlayers = (match.players || []).filter(player =>
    player.account_id && player.account_id !== getAnonymousAccountId());
  async.each(filteredPlayers, (player, cb) => {
    insertPlayer(db, {
      account_id: player.account_id,
      last_match_time: new Date(match.start_time * 1000),
    }, cb);
  }, cb);
}

/*
function updateCompositions(match, cb) {
  async.each(generateMatchups(match, 5, true), (team, cb) => {
    const key = team.split(':')[0];
    const win = Number(team.split(':')[1]);
    db.raw(`INSERT INTO compositions (composition, games, wins)
    VALUES (?, 1, ?)
    ON CONFLICT(composition)
    DO UPDATE SET games = compositions.games + 1, wins = compositions.wins + ?
    `, [key, win, win]).asCallback(cb);
    redis.hincrby('compositions', team, 1, cb);
  }, cb);
}

function updateMatchups(match, cb) {
  async.each(generateMatchups(match, 1), (key, cb) => {
    db.raw(`INSERT INTO matchups (matchup, num)
    VALUES (?, 1)
    ON CONFLICT(matchup)
    DO UPDATE SET num = matchups.num + 1
    `, [key]).asCallback(cb);
    cassandra.execute(`UPDATE matchups
    SET num = num + 1
    WHERE matchup = ?
    `, [key], {prepare: true}, cb);
    redis.hincrby('matchups', key, 2, cb);
  }, cb);
}
*/

function processCounts(match, cb) {
  console.log('match %s', match.match_id);
  return async.parallel({
    updateRankings(cb) {
      if (isSignificant(match)) {
        return updateHeroRankings(match, cb);
      }
      return cb();
    },
    updateBenchmarks(cb) {
      if (isSignificant(match)) {
        return updateBenchmarks(match, cb);
      }
      return cb();
    },
    updateMmrEstimate(cb) {
      if (isSignificant(match)) {
        return updateMmrEstimate(match, cb);
      }
      return cb();
    },
    upsertMatchSample(cb) {
      if (isSignificant(match) && match.match_id % 100 < config.PUBLIC_SAMPLE_PERCENT) {
        return upsertMatchSample(match, cb);
      }
      return cb();
    },
    updateRecords(cb) {
      if (isSignificant(match) && match.lobby_type === 7) {
        return updateRecords(match, cb);
      }
      return cb();
    },
    updateLastPlayed(cb) {
      return updateLastPlayed(match, cb);
    },
    /*
      updateCompositions(cb) {
        if (options.origin === 'scanner') {
          return updateCompositions(match, cb);
        }
        return cb();
      }
      updateMatchups(cb) {
        if (options.origin === 'scanner') {
          return updateMatchups(match, cb);
        }
        return cb();
      },
      */
  }, cb);
}

queue.runQueue('countsQueue', 1, processCounts);
