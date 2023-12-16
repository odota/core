// Processes a queue of new matches to update totals/ratings
import moment from 'moment';
import redis from '../store/redis';
import db from '../store/db';
import {
  getMatchRankTier,
  upsertPlayer,
  bulkIndexPlayer,
  upsert,
} from '../store/queries';
import queue from '../store/queue';
import config from '../config.js';
import { benchmarks } from '../util/benchmarksUtil';
import {
  isSignificant,
  getAnonymousAccountId,
  isRadiant,
  getStartOfBlockMinutes,
} from '../util/utility';

async function updateHeroRankings(match: Match) {
  if (!isSignificant(match)) {
    return;
  }
  const { avg } = await getMatchRankTier(match.players);
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
      return db.raw(
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
    const { avg, num } = await getMatchRankTier(match.players);
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
      await upsert(trx, 'public_matches', newMatch, {
        match_id: newMatch.match_id,
      });
      await Promise.all(
        (match.players || []).map((pm) => {
          pm.match_id = match.match_id;
          return upsert(trx, 'public_player_matches', pm, {
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
  field: keyof Match | keyof Player,
  match: Match,
  player: Player
) {
  redis.zadd(
    `records:${field}`,
    match[field as keyof Match] || player[field as keyof Player],
    [match.match_id, match.start_time, player.hero_id].join(':')
  );
  // Keep only 100 top scores
  redis.zremrangebyrank(`records:${field}`, '0', '-101');
  const expire = moment().add(1, 'month').startOf('month').format('X');
  redis.expireat(`records:${field}`, expire);
}
async function updateRecords(match: Match) {
  if (isSignificant(match) && match.lobby_type === 7) {
    updateRecord('duration', match, {} as Player);
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
  const bulkUpdate = filteredPlayers.reduce<any>((acc, player) => {
    acc.push(
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
      upsertPlayer(
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
  return db.raw(
    'INSERT INTO hero_search (match_id, teamA, teamB, teamAWin, start_time) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
    [match.match_id, teamA, teamB, teamAWin, match.start_time]
  );
}
async function updateHeroCounts(match: Match) {
  // If match has leagueid, update pro picks and wins
  // If turbo, update picks and wins
  // Otherwise, update pub picks and wins if significant
  // If none of the above, skip
  // If pub and we have a rank tier, also update the 1-8 rank pick/win
  let tier: string | null = null;
  let rank: number | null = null;
  if (match.leagueid) {
    tier = 'pro';
  } else if (match.game_mode === 23) {
    tier = 'turbo';
  } else if (isSignificant(match)) {
    tier = 'pub';
    let { avg } = await getMatchRankTier(match.players);
    if (avg) {
      rank = Math.floor(avg / 10);
    }
  }
  if (!tier) {
    return;
  }
  const timestamp = moment().startOf('day').unix();
  const expire = moment().startOf('day').add(8, 'day').unix();
  for (let i = 0; i < match.players.length; i += 1) {
    const player = match.players[i];
    const heroId = player.hero_id;
    if (heroId) {
      const win = Number(isRadiant(player) === match.radiant_win);
      const updateKeys = (prefix: string) => {
        const rKey = `${heroId}:${prefix}:pick:${timestamp}`;
        redis.incr(rKey);
        redis.expireat(rKey, expire);
        if (win) {
          const rKeyWin = `${heroId}:${prefix}:win:${timestamp}`;
          redis.incr(rKeyWin);
          redis.expireat(rKeyWin, expire);
        }
      }
      if (tier) {
        // pro, pub, or turbo
        updateKeys(tier);
      }
      if (rank) {
        // 1 to 8 based on the average level of the match
        updateKeys(rank.toString());
      }
    }
  }
  // Do bans for pro
  if (match.leagueid) {
    match.picks_bans?.forEach(pb => {
      if (pb.is_pick === false) {
        const heroId = pb.hero_id;
        const rKey = `${heroId}:pro:ban:${timestamp}`;
        redis.incr(rKey);
        redis.expireat(rKey, expire);
      }
    });
  }
}

async function updateBenchmarks(match: Match) {
  if (match.match_id % 100 < config.BENCHMARKS_SAMPLE_PERCENT) {
    for (let i = 0; i < match.players.length; i += 1) {
      const p = match.players[i];
      // only do if all players have heroes
      if (p.hero_id) {
        Object.keys(benchmarks).forEach((key) => {
          const metric = benchmarks[key](match, p);
          if (
            metric !== undefined &&
            metric !== null &&
            !Number.isNaN(Number(metric))
          ) {
            const rkey = [
              'benchmarks',
              getStartOfBlockMinutes(config.BENCHMARK_RETENTION_MINUTES, 0),
              key,
              p.hero_id,
            ].join(':');
            redis.zadd(rkey, metric, match.match_id);
            // expire at time two epochs later (after prev/current cycle)
            const expiretime = getStartOfBlockMinutes(
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
  await updateHeroCounts(match);
  await updateBenchmarks(match);
}
queue.runQueue('countsQueue', 1, processCounts);
