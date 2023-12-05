// Processes a queue of new matches to update totals/ratings
import moment from 'moment';
import redis from '../store/redis.mjs';
import db from '../store/db.mjs';
import utility from '../util/utility.mjs';
import {
  getMatchRankTier,
  insertPlayerPromise,
  bulkIndexPlayer,
  upsertPromise,
} from '../store/queries.mjs';
import queue from '../store/queue.mjs';
import config from '../config.js';
import { benchmarks } from '../util/benchmarksUtil.mjs';
const { getAnonymousAccountId, isRadiant, isSignificant } = utility;

async function updateHeroRankings(match: Match) {
  if (!isSignificant(match)) {
    return;
  }
  const { avg } = await getMatchRankTier(match);
  const matchScore = avg && !Number.isNaN(Number(avg)) ? avg * 100 : undefined;
  if (!matchScore) {
    return;
  }
  await Promise.all(
    match.players.map(async (player) => {
      if (
        !player.account_id ||
        player.account_id === getAnonymousAccountId() ||
        !player.hero_id
      ) {
        return;
      }
      player.radiant_win = match.radiant_win;
      // Treat the result as an Elo rating change where the opponent is the average rank tier of the match * 100
      const win = Number(isRadiant(player) === player.radiant_win);
      const kFactor = 100;
      const data1 = await db.select('score').from('hero_ranking').where({
        account_id: player.account_id,
        hero_id: player.hero_id,
      });
      const currRating1 = Number((data1 && data1[0] && data1[0].score) || 4000);
      const r1 = 10 ** (currRating1 / 1000);
      const r2 = 10 ** (matchScore / 1000);
      const e1 = r1 / (r1 + r2);
      const ratingDiff1 = kFactor * (win - e1);
      const newScore = currRating1 + ratingDiff1;
      return await db.raw(
        'INSERT INTO hero_ranking VALUES(?, ?, ?) ON CONFLICT(account_id, hero_id) DO UPDATE SET score = ?',
        [player.account_id, player.hero_id, newScore, newScore]
      );
    })
  );
}

async function upsertMatchSample(match: Match) {
  if (
    isSignificant(match) &&
    match.match_id % 100 < config.PUBLIC_SAMPLE_PERCENT
  ) {
    const { avg, num } = await getMatchRankTier(match);
    if (!avg || num < 2) {
      return;
    }
    const trx = await db.transaction();
    try {
      const matchMmrData = {
        avg_rank_tier: avg || null,
        num_rank_tier: num || null,
      };
      const newMatch = { ...match, ...matchMmrData };
      //@ts-ignore
      await upsertPromise(trx, 'public_matches', newMatch, {
        match_id: newMatch.match_id,
      });
      await Promise.all(
        (match.players || []).map((pm) => {
          pm.match_id = match.match_id;
          //@ts-ignore
          return upsertPromise(trx, 'public_player_matches', pm, {
            match_id: pm.match_id,
            player_slot: pm.player_slot,
          });
        })
      );
    } catch (e) {
      await trx.rollback();
      throw e;
    }
    await trx.commit();
    return;
  }
}
async function updateRecord(
  field: string,
  match: Match,
  player: Player | { hero_id?: number }
) {
  redis.zadd(
    `records:${field}`,
    //@ts-ignore
    match[field] || player[field],
    [match.match_id, match.start_time, player.hero_id].join(':')
  );
  // Keep only 100 top scores
  redis.zremrangebyrank(`records:${field}`, '0', '-101');
  const expire = moment().add(1, 'month').startOf('month').format('X');
  redis.expireat(`records:${field}`, expire);
}
async function updateRecords(match: Match) {
  if (isSignificant(match) && match.lobby_type === 7) {
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
  }
}
async function updateLastPlayed(match: Match) {
  const filteredPlayers = (match.players || []).filter(
    (player) =>
      player.account_id && player.account_id !== getAnonymousAccountId()
  );
  const lastMatchTime = new Date(match.start_time * 1000);
  const bulkUpdate = filteredPlayers.reduce((acc, player) => {
    acc.push(
      //@ts-ignore
      {
        update: {
          _id: player.account_id,
        },
      },
      {
        doc: {
          last_match_time: lastMatchTime,
        },
        doc_as_upsert: true,
      }
    );
    return acc;
  }, []);
  bulkIndexPlayer(bulkUpdate);
  await Promise.all(
    filteredPlayers.map((player) =>
      insertPlayerPromise(
        db,
        {
          account_id: player.account_id,
          last_match_time: lastMatchTime,
        },
        false
      )
    )
  );
}
/**
 * Update table storing heroes played in a game for lookup of games by heroes played
 * */
async function updateHeroSearch(match: Match) {
  const radiant = [];
  const dire = [];
  for (let i = 0; i < match.players.length; i += 1) {
    const p = match.players[i];
    if (p.hero_id === 0) {
      // exclude this match if any hero is 0
      return;
    }
    if (isRadiant(p)) {
      radiant.push(p.hero_id);
    } else {
      dire.push(p.hero_id);
    }
  }
  // Turn the arrays into strings
  // const rcg = groupToString(radiant);
  // const dcg = groupToString(dire);
  // Always store the team whose string representation comes first (as teamA)
  // This lets us only search in one order when we do a query
  // Currently disabled because this doesn't work if the query is performed with a subset
  // const inverted = rcg > dcg;
  const inverted = false;
  const teamA = inverted ? dire : radiant;
  const teamB = inverted ? radiant : dire;
  const teamAWin = inverted ? !match.radiant_win : match.radiant_win;
  return await db.raw(
    'INSERT INTO hero_search (match_id, teamA, teamB, teamAWin, start_time) VALUES (?, ?, ?, ?, ?)',
    [match.match_id, teamA, teamB, teamAWin, match.start_time]
  );
}
async function updateTurbo(match: Match) {
  if (match.game_mode === 23) {
    for (let i = 0; i < match.players.length; i += 1) {
      const player = match.players[i];
      const heroId = player.hero_id;
      if (heroId) {
        const win = Number(isRadiant(player) === match.radiant_win);
        redis.hincrby('turboPicks', heroId, 1);
        if (win) {
          redis.hincrby('turboWins', heroId, 1);
        }
      }
    }
    redis.expireat('turboPicks', moment().endOf('month').unix());
    redis.expireat('turboWins', moment().endOf('month').unix());
  }
}

async function updateBenchmarks(match: Match) {
  if (match.match_id % 100 < config.BENCHMARKS_SAMPLE_PERCENT) {
    for (let i = 0; i < match.players.length; i += 1) {
      const p = match.players[i];
      // only do if all players have heroes
      if (p.hero_id) {
        Object.keys(benchmarks).forEach((key) => {
          //@ts-ignore
          const metric = benchmarks[key](match, p);
          if (
            metric !== undefined &&
            metric !== null &&
            !Number.isNaN(Number(metric))
          ) {
            const rkey = [
              'benchmarks',
              utility.getStartOfBlockMinutes(
                config.BENCHMARK_RETENTION_MINUTES,
                0
              ),
              key,
              p.hero_id,
            ].join(':');
            redis.zadd(rkey, metric, match.match_id);
            // expire at time two epochs later (after prev/current cycle)
            const expiretime = utility.getStartOfBlockMinutes(
              config.BENCHMARK_RETENTION_MINUTES,
              2
            );
            redis.expireat(rkey, expiretime);
          }
        });
      }
    }
  }
}
/*
// Stores winrate of each subset of heroes in this game
function updateCompositions(match) {
  generateMatchups(match, 5, true).forEach((team) => {
    const key = team.split(':')[0];
    const win = Number(team.split(':')[1]);
    db.raw(`INSERT INTO compositions (composition, games, wins)
    VALUES (?, 1, ?)
    ON CONFLICT(composition)
    DO UPDATE SET games = compositions.games + 1, wins = compositions.wins + ?
    `, [key, win, win]).asCallback(cb);
    redis.hincrby('compositions', team, 1, cb);
  });
}

// Stores result of each matchup of subsets of heroes in this game
function updateMatchups(match) {
  generateMatchups(match, 1).forEach((key) => {
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
async function processCounts(match: Match) {
  console.log('match %s', match.match_id);
  await updateHeroRankings(match);
  await upsertMatchSample(match);
  await updateRecords(match);
  await updateLastPlayed(match);
  await updateHeroSearch(match);
  await updateTurbo(match);
  await updateBenchmarks(match);
}
await queue.runQueue('countsQueue', 1, processCounts);
