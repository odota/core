import moment from 'moment';
import { patch } from 'dotaconstants';
import util from 'node:util';
import fs from 'node:fs/promises';
import config from '../../config.ts';
import { addJob, addReliableJob } from '../store/queue.ts';
import db, { upsert, upsertPlayer } from '../store/db.ts';
import redis, { redisCount } from '../store/redis.ts';
import {
  getAnonymousAccountId,
  serialize,
  isProMatch,
  getLaneFromPosData,
  isRadiant,
  getPatchIndex,
  transformMatch,
  createMatchCopy,
  isSignificant,
  getStartOfBlockMinutes,
  getEndOfWeek,
  isTurbo,
} from './utility.ts';
import {
  getMatchRankTier,
  isRecentVisitor,
  isRecentlyVisited,
} from './queries.ts';
import { getPGroup } from './pgroup.ts';
import { blobArchive } from '../store/archive.ts';
import cassandra, { getCassandraColumns } from '../store/cassandra.ts';
import { computeMatchData } from './compute.ts';
import { benchmarks } from './benchmarksUtil.ts';
import type knex from 'knex';

moment.relativeTimeThreshold('ss', 0);

/**
 * Inserts a piece of match data into storage
 * We currently can call this function from many places
 * There is a type to indicate source: api, gcdata, parsed
 * Also an origin to indicate the context: scanner (fresh match) or request
 * @param origMatch
 * @param options
 * @returns
 */
export async function insertMatch(
  origMatch: Readonly<InsertMatchInput>,
  options: InsertMatchOptions,
) {
  // Make a copy of the match with some modifications (only applicable to api matches)
  const match = transformMatch(origMatch);
  // Use the passed pgroup if gcdata or parsed, otherwise build it
  // Do this after removing anonymous account IDs
  const pgroup = options.pgroup ?? getPGroup(match as ApiData);
  const trx = await db.transaction();
  try {
    let isProTier = false;
    if ('leagueid' in match && match.leagueid) {
      // Check if leagueid is premium/professional
      const { rows } = await trx.raw(
        `select leagueid from leagues where leagueid = ? and (tier = 'premium' OR tier = 'professional')`,
        [Number(match.leagueid)],
      );
      isProTier = rows?.length > 0;
    }

    // Index the matchid to the league
    if (
      options.origin === 'scanner' &&
      options.type === 'api' &&
      'leagueid' in match &&
      match.leagueid
    ) {
      await trx.raw(
        'INSERT INTO league_match(leagueid, match_id) VALUES(?, ?) ON CONFLICT DO NOTHING',
        [match.leagueid, match.match_id],
      );
    }

    let average_rank: number | undefined = undefined;
    let num_rank_tier: number | undefined = undefined;
    // Only fetch the average_rank if this is a fresh match since otherwise it won't be accurate
    if (options.origin === 'scanner' && options.type === 'api') {
      let { avg, num, players } = await getMatchRankTier(trx, match.players);
      if (avg) {
        average_rank = avg;
      }
      if (num) {
        num_rank_tier = num;
      }
      // average_rank should be stored in a new blob column too since it's not part of API data
      // We could also store the ranks of the players here rather than looking up their current rank on view
      // That's probably better anyway since it's more accurate to show their rank at the time of the match
      // let ranksBlob = { match_id: match.match_id, average_rank, players };
      // await upsertBlob('ranks', ranksBlob);
    }
    await upsertMatchPostgres(trx, isProTier);
    await upsertPlayerCaches(match, average_rank, pgroup, options.type);
    await upsertMatchBlobs();
    await resetMatchCache();
    await resetPlayerTemp();
    await telemetry();
    await updateCounts(
      trx,
      match as ApiData,
      average_rank,
      num_rank_tier,
      isProTier,
    );
    await discoverPlayers(trx);
    await queueMmr();
    await queueGcData(trx);
    await queueRate(trx);
    await queueScenarios();
    await postParsedMatch(trx);
    const parseJob = await queueParse(trx);
    await trx.commit();
    return { parseJob, pgroup };
  } catch (e) {
    console.log('[INSERTMATCH] rolling back transaction...');
    await trx.rollback();
    throw e;
  }

  async function upsertMatchPostgres(
    trx: knex.Knex.Transaction,
    isProTier: boolean,
  ) {
    if (options.type !== 'api' && options.type !== 'parsed') {
      // Only if API or parse data
      return;
    }
    if (options.type === 'api' && !isProMatch(match as ApiData)) {
      // Check whether we care about this match for pro purposes
      // We need the basic match data to run the check, so only do it if type is api
      // console.log('[UPSERTMATCHPOSTGRES]: skipping due to check');
      return;
    }
    if (!isProTier) {
      // Skip if not in a pro league (premium or professional tier)
      console.log('[UPSERTMATCHPOSTGRES]: skipping league match due to tier');
      return;
    }
    // If parsed data, we want to make sure the match exists in DB
    // Otherwise we could end up with parsed data only rows for matches we skipped above
    // We might want to switch the upsert to UPDATE instead for parsed case
    // That requires writing a new SQL query though
    // If we do that then we can put the NOT NULL constraint on hero_id
    if (options.type === 'parsed') {
      const { rows } = await trx.raw(
        'select match_id from matches where match_id = ?',
        [match.match_id],
      );
      if (!rows.length) {
        return;
      }
    }

    // matches
    await upsert(trx, 'matches', match, {
      match_id: match.match_id,
    });

    // player_matches
    await Promise.all(
      match.players.map((p) => {
        const pm = { ...p, match_id: match.match_id } as ParsedPlayerMatch;
        // Add lane data
        if (pm.lane_pos) {
          const laneData = getLaneFromPosData(pm.lane_pos, isRadiant(pm));
          pm.lane = laneData.lane ?? null;
          pm.lane_role = laneData.lane_role ?? null;
          pm.is_roaming = laneData.is_roaming ?? null;
        }
        return upsert(trx, 'player_matches', pm, {
          match_id: pm.match_id,
          player_slot: pm.player_slot,
        });
      }),
    );

    // picks_bans
    if ('picks_bans' in match && match.picks_bans) {
      await Promise.all(
        match.picks_bans.map((p) => {
          // order is a reserved keyword in postgres
          return upsert(
            trx,
            'picks_bans',
            { ...p, ord: p.order, match_id: match.match_id },
            {
              match_id: 1,
              ord: 1,
            },
          );
        }),
      );
    }

    // match_patch
    if ('start_time' in match && match.start_time) {
      await upsert(
        trx,
        'match_patch',
        {
          match_id: match.match_id,
          patch: patch[getPatchIndex(match.start_time)].name,
        },
        {
          match_id: match.match_id,
        },
      );
    }

    // team_match
    const teamMatch = [];
    if ('radiant_team_id' in match && match.radiant_team_id) {
      teamMatch.push({
        team_id: match.radiant_team_id,
        match_id: match.match_id,
        radiant: true,
      });
    }
    if ('dire_team_id' in match && match.dire_team_id) {
      teamMatch.push({
        team_id: match.dire_team_id,
        match_id: match.match_id,
        radiant: false,
      });
    }
    await Promise.all(
      teamMatch.map((tm) => {
        return upsert(trx, 'team_match', tm, {
          team_id: tm.team_id,
          match_id: tm.match_id,
        });
      }),
    );

    // Team ratings
    if (
      options.origin === 'scanner' &&
      options.type === 'api' &&
      'radiant_team_id' in match &&
      'dire_team_id' in match &&
      match.radiant_win !== undefined
    ) {
      const team1 = match.radiant_team_id;
      const team2 = match.dire_team_id;
      const team1Win = Number(match.radiant_win);
      const kFactor = 32;
      const data1 = await trx
        .select('rating')
        .from('team_rating')
        .where({ team_id: team1 });
      const data2 = await trx
        .select('rating')
        .from('team_rating')
        .where({ team_id: team2 });
      const currRating1 = Number(
        (data1 && data1[0] && data1[0].rating) || 1000,
      );
      const currRating2 = Number(
        (data2 && data2[0] && data2[0].rating) || 1000,
      );
      const r1 = 10 ** (currRating1 / 400);
      const r2 = 10 ** (currRating2 / 400);
      const e1 = r1 / (r1 + r2);
      const e2 = r2 / (r1 + r2);
      const win1 = team1Win;
      const win2 = Number(!team1Win);
      const ratingDiff1 = kFactor * (win1 - e1);
      const ratingDiff2 = kFactor * (win2 - e2);
      const query = `INSERT INTO team_rating(team_id, rating, wins, losses, last_match_time) VALUES(?, ?, ?, ?, ?)
          ON CONFLICT(team_id) DO UPDATE SET team_id=team_rating.team_id, rating=team_rating.rating + ?, wins=team_rating.wins + ?, losses=team_rating.losses + ?, last_match_time=?`;
      await trx.raw(query, [
        team1,
        currRating1 + ratingDiff1,
        win1,
        Number(!win1),
        match.start_time,
        ratingDiff1,
        win1,
        Number(!win1),
        match.start_time,
      ]);
      await trx.raw(query, [
        team2,
        currRating2 + ratingDiff2,
        win2,
        Number(!win2),
        match.start_time,
        ratingDiff2,
        win2,
        Number(!win2),
        match.start_time,
      ]);
    }
  }
  async function upsertMatchBlobs() {
    // The table holds data for each possible stage of ingestion, api/gcdata/replay/meta etc.
    // We store a match blob in the row for each stage
    // in buildMatch we can assemble the data from all these pieces
    // After some retention period we stick the assembled blob in match archive and delete it

    // NOTE: apparently the Steam API started deleting some fields on old matches, like HD/TD/ability builds
    // Currently this means fullhistory could overwrite the blob later and we could lose some data
    // Implement "ifNotExists" behavior if we need to avoid overwriting

    let copy = createMatchCopy<typeof match>(match);
    await upsertBlob(options.type, copy);

    async function upsertBlob(
      type: DataType,
      blob: { match_id: number; players: { player_slot: number }[] },
    ) {
      const matchId = blob.match_id;
      await blobArchive.archivePut(
        matchId + '_' + type,
        Buffer.from(JSON.stringify(blob)),
      );
      if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
        await fs.writeFile(
          './json/' + matchId + '_' + type + '.json',
          JSON.stringify(blob, null, 2),
        );
      }
    }
  }

  async function telemetry() {
    // Publish to log stream
    const endedAt =
      options.endedAt ??
      ('start_time' in match && 'duration' in match
        ? match.start_time + match.duration
        : 0);
    const name = process.env.APP_NAME || process.argv[1];
    const message = `[${new Date().toISOString()}] [${name}] [insert: ${
      options.type
    }] [ended: ${moment.unix(endedAt ?? 0).fromNow()}] ${match.match_id}`;
    redis?.publish(options.type, message);
    if (options.type === 'parsed') {
      redisCount('parser');
    }
    if (options.origin === 'scanner' && options.type === 'api') {
      redisCount('added_match');
      // match.players
      //   .filter((p) => p.account_id)
      //   .forEach(async (p) => {
      // if (p.account_id) {
      //   redisCountDistinct(
      //     'distinct_match_player',
      //     p.account_id.toString(),
      //   );
      // const visitTime = Number(await redis.zscore('visitors', p.account_id.toString()));
      // if (visitTime) {
      //   redisCountDistinct(
      //     'distinct_match_player_user',
      //     p.account_id.toString(),
      //   );
      //   if (visitTime > Number(moment.utc().subtract(30, 'day').format('X'))) {
      //     redisCountDistinct(
      //       'distinct_match_player_recent_user',
      //       p.account_id.toString(),
      //     );
      //   }
      // }
      // }
      // });
    }
  }
  async function resetMatchCache() {
    if (config.ENABLE_MATCH_CACHE) {
      await redis?.del(`match:${match.match_id}`);
    }
  }
  async function resetPlayerTemp() {
    if (config.ENABLE_PLAYER_CACHE) {
      await Promise.allSettled(
        match.players.map(async (p) => {
          const account_id = pgroup[p.player_slot]?.account_id ?? p.account_id;
          if (account_id) {
            try {
              // Try deleting the tempfile ince it's now out of date
              await fs.unlink('./cache/' + account_id);
            } catch (e) {
              // File didn't exist, ignore
            }
            const isVisitor = await isRecentVisitor(account_id);
            const isVisited = await isRecentlyVisited(account_id);
            if (isVisitor || isVisited) {
              // If OpenDota visitor or profile was recently visited by anyone, pre-compute the tempfile
              await addJob({
                name: 'cacheQueue',
                data: account_id.toString(),
              });
            }
          }
        }),
      );
    }
  }
  async function updateCounts(
    trx: knex.Knex.Transaction,
    match: ApiData,
    avg: number | undefined,
    num: number | undefined,
    isProTier: boolean,
  ) {
    // Update temporary match counts/hero rankings
    if (options.origin === 'scanner' && options.type === 'api') {
      await updateHeroRankings();
      await upsertMatchSample();
      await updateHeroSearch();
      await updateLastPlayed();
      await updateRecords();
      await updateHeroCounts(isProTier);
      await updateMatchCounts();
      await updateBenchmarks();
    }

    async function updateHeroRankings() {
      if (!isSignificant(match)) {
        return;
      }
      const matchScore =
        avg && !Number.isNaN(Number(avg)) ? avg * 100 : undefined;
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
          const radiant_win = match.radiant_win;
          // Treat the result as an Elo rating change where the opponent is the average rank tier of the match * 100
          const win = Number(isRadiant(player) === radiant_win);
          const kFactor = 100;
          const data1 = await trx.select('score').from('hero_ranking').where({
            account_id: player.account_id,
            hero_id: player.hero_id,
          });
          const currRating1 = Number(
            (data1 && data1[0] && data1[0].score) || 4000,
          );
          const r1 = 10 ** (currRating1 / 1000);
          const r2 = 10 ** (matchScore / 1000);
          const e1 = r1 / (r1 + r2);
          const ratingDiff1 = kFactor * (win - e1);
          const newScore = currRating1 + ratingDiff1;
          return trx.raw(
            'INSERT INTO hero_ranking VALUES(?, ?, ?) ON CONFLICT(account_id, hero_id) DO UPDATE SET score = ?',
            [player.account_id, player.hero_id, newScore, newScore],
          );
        }),
      );
    }

    async function upsertMatchSample() {
      if (
        isSignificant(match) &&
        match.match_id % 100 < Number(config.PUBLIC_SAMPLE_PERCENT)
      ) {
        if (!avg || !num) {
          return;
        }
        const matchMmrData = {
          avg_rank_tier: avg ?? null,
          num_rank_tier: num ?? null,
        };
        const radiant_team = match.players
          .filter((p) => isRadiant(p))
          .map((p) => p.hero_id);
        const dire_team = match.players
          .filter((p) => !isRadiant(p))
          .map((p) => p.hero_id);
        const newMatch = {
          ...match,
          ...matchMmrData,
          radiant_team,
          dire_team,
        };
        await upsert(trx, 'public_matches', newMatch, {
          match_id: newMatch.match_id,
        });
      }
    }

    async function updateRecord(
      field: keyof ApiData | keyof ApiDataPlayer,
      player: ApiDataPlayer,
    ) {
      redis.zadd(
        `records:${field}`,
        (match[field as keyof ApiData] ||
          player[field as keyof ApiDataPlayer]) as number,
        [match.match_id, match.start_time, player.hero_id].join(':'),
      );
      // Keep only 100 top scores
      redis.zremrangebyrank(`records:${field}`, '0', '-101');
      const expire = getEndOfWeek();
      redis.expireat(`records:${field}`, expire);
    }

    async function updateRecords() {
      if (isSignificant(match) && match.lobby_type === 7) {
        updateRecord('duration', {} as ApiDataPlayer);
        match.players.forEach((player) => {
          updateRecord('kills', player);
          updateRecord('deaths', player);
          updateRecord('assists', player);
          updateRecord('last_hits', player);
          updateRecord('denies', player);
          updateRecord('gold_per_min', player);
          updateRecord('xp_per_min', player);
          updateRecord('hero_damage', player);
          updateRecord('tower_damage', player);
          updateRecord('hero_healing', player);
        });
      }
    }

    async function updateLastPlayed() {
      const filteredPlayers = match.players.filter(
        (player) =>
          player.account_id && player.account_id !== getAnonymousAccountId(),
      );
      const lastMatchTime = new Date(match.start_time * 1000);
      await Promise.all(
        filteredPlayers.map((player) =>
          upsertPlayer(trx, {
            account_id: player.account_id,
            last_match_time: lastMatchTime,
            // If the player's ID is showing up then they aren't anonymous
            fh_unavailable: false,
          }),
        ),
      );
    }

    /**
     * Update table storing heroes played in a game for lookup of games by heroes played
     * */
    async function updateHeroSearch() {
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
      await trx.raw(
        'INSERT INTO hero_search (match_id, teamA, teamB, teamAWin, start_time) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
        [match.match_id, teamA, teamB, teamAWin, match.start_time],
      );
    }

    async function updateHeroCounts(isProTier: boolean) {
      // If match has leagueid, update pro picks and wins
      // If turbo, update picks and wins
      // Otherwise, update pub picks and wins if significant
      // If none of the above, skip
      // If pub and we have a rank tier, also update the 1-8 rank pick/win
      let tier: string | null = null;
      let rank: number | null = null;
      if (isProTier) {
        tier = 'pro';
      } else if (isTurbo(match)) {
        tier = 'turbo';
      } else if (isSignificant(match)) {
        tier = 'pub';
        if (avg) {
          rank = Math.floor(avg / 10);
        }
      }
      if (!tier) {
        return;
      }
      const timestamp = moment.utc().startOf('day').unix();
      const expire = moment.utc().startOf('day').add(8, 'day').unix();
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
          };
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
      if (isProTier) {
        match.picks_bans?.forEach((pb) => {
          if (pb.is_pick === false) {
            const heroId = pb.hero_id;
            const rKey = `${heroId}:pro:ban:${timestamp}`;
            redis.incr(rKey);
            redis.expireat(rKey, expire);
          }
        });
      }
    }

    async function updateMatchCounts() {
      await redisCount(`${match.game_mode}_game_mode` as MetricName);
      await redisCount(`${match.lobby_type}_lobby_type` as MetricName);
      await redisCount(`${match.cluster}_cluster` as MetricName);
    }

    async function updateBenchmarks() {
      const turbo = isTurbo(match);
      if (
        match.match_id % 100 < Number(config.BENCHMARKS_SAMPLE_PERCENT) &&
        (isSignificant(match) || turbo)
      ) {
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
                  getStartOfBlockMinutes(
                    Number(config.BENCHMARK_RETENTION_MINUTES),
                    0,
                  ),
                  key,
                  p.hero_id,
                  turbo ? 'turbo' : '',
                ].join(':');
                redis.zadd(rkey, metric, match.match_id);
                // expire at time two epochs later (after prev/current cycle)
                const expiretime = getStartOfBlockMinutes(
                  Number(config.BENCHMARK_RETENTION_MINUTES),
                  2,
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
function updateCompositions() {
  generateMatchups(match, 5, true).forEach((team) => {
    const key = team.split(':')[0];
    const win = Number(team.split(':')[1]);
    trx.raw(`INSERT INTO compositions (composition, games, wins)
    VALUES (?, 1, ?)
    ON CONFLICT(composition)
    DO UPDATE SET games = compositions.games + 1, wins = compositions.wins + ?
    `, [key, win, win]);
    redis.hincrby('compositions', team, 1);
  });
}

// Stores result of each matchup of subsets of heroes in this game
function updateMatchups(match) {
  generateMatchups(match, 1).forEach((key) => {
    trx.raw(`INSERT INTO matchups (matchup, num)
    VALUES (?, 1)
    ON CONFLICT(matchup)
    DO UPDATE SET num = matchups.num + 1
    `, [key])
    redis.hincrby('matchups', key, 1);
}
*/
  }

  async function discoverPlayers(trx: knex.Knex.Transaction) {
    // Player discovery
    // Add a placeholder player with just the ID
    // Queue a profile update request
    // The profiler process will update profiles randomly as well
    // We can also discover players from gcdata where they're not anonymous
    const arr = match.players.filter((p) => {
      return p.account_id && p.account_id !== getAnonymousAccountId();
    });
    await Promise.all(
      arr.map(async (p) => {
        const { rows } = await trx.raw(
          'INSERT INTO players(account_id) VALUES(?) ON CONFLICT DO NOTHING RETURNING account_id',
          [p.account_id],
        );
        if (rows.length) {
          redisCount('player_discover');
          if (p.account_id) {
            await addJob({
              name: 'profileQueue',
              data: {
                account_id: p.account_id,
              },
            });
            // Also queue a refresh of the user's rank/medal
            await addJob({
              name: 'mmrQueue',
              data: {
                account_id: p.account_id,
              },
            });
          }
        }
      }),
    );
  }
  async function queueMmr() {
    // Trigger an update for player rank_tier if ranked match
    const arr = match.players.filter<ApiDataPlayer>((p): p is ApiDataPlayer => {
      return Boolean(
        options.origin === 'scanner' &&
          options.type === 'api' &&
          'lobby_type' in match &&
          match.lobby_type === 7 &&
          p.account_id &&
          p.account_id !== getAnonymousAccountId() &&
          config.ENABLE_RANDOM_MMR_UPDATE,
      );
    });
    await Promise.all(
      arr.map((p) =>
        addJob({
          name: 'mmrQueue',
          data: {
            account_id: p.account_id,
          },
        }),
      ),
    );
  }
  async function queueGcData(trx: knex.Knex.Transaction) {
    // Trigger a request for gcdata
    if (
      options.origin === 'scanner' &&
      options.type === 'api' &&
      'game_mode' in match &&
      // Don't get replay URLs for event matches
      match.game_mode !== 19 &&
      match.match_id % 100 < Number(config.GCDATA_PERCENT)
    ) {
      await addReliableJob(
        {
          name: 'gcQueue',
          data: {
            match_id: match.match_id,
            pgroup,
          },
        },
        {
          trx,
        },
      );
    }
  }

  async function queueRate(trx: knex.Knex.Transaction) {
    // Decide whether to rate the match
    // Rate a percentage of ranked matches
    if (
      options.origin === 'scanner' &&
      options.type === 'api' &&
      'lobby_type' in match &&
      match.lobby_type === 7 &&
      match.match_id % 100 < Number(config.RATING_PERCENT)
    ) {
      await trx.raw(
        'INSERT INTO rating_queue(match_seq_num, match_id, radiant_win) VALUES(?, ?, ?) ON CONFLICT DO NOTHING',
        [match.match_seq_num, match.match_id, match.radiant_win],
      );
      await addReliableJob(
        {
          name: 'gcQueue',
          data: {
            match_id: match.match_id,
            pgroup,
          },
        },
        {
          trx,
        },
      );
    }
  }

  async function queueScenarios() {
    // Decide if we want to do scenarios (requires parsed match)
    // Only if it originated from scanner to avoid triggering on requests
    if (
      options.origin === 'scanner' &&
      options.type === 'parsed' &&
      match.match_id % 100 < Number(config.SCENARIOS_SAMPLE_PERCENT)
    ) {
      await addJob({
        name: 'scenariosQueue',
        data: match.match_id.toString(),
      });
    }
  }
  async function postParsedMatch(trx: knex.Knex.Transaction) {
    if (options.type === 'parsed') {
      // Mark this match parsed
      await trx.raw(
        'INSERT INTO parsed_matches(match_id) VALUES(?) ON CONFLICT DO NOTHING',
        [Number(match.match_id)],
      );
    }
  }
  async function queueParse(trx: knex.Knex.Transaction) {
    if (options.skipParse) {
      return null;
    }
    if ('game_mode' in match && match.game_mode === 19) {
      // don't parse event matches
      return null;
    }
    // We only auto-parse if this is a fresh match from API
    if (!(options.origin === 'scanner' && options.type === 'api')) {
      return null;
    }
    // determine if any player in the match is tracked
    const trackedScores = await Promise.all(
      match.players.map((p) => {
        return redis.zscore('tracked', String(p.account_id));
      }),
    );
    let hasTrackedPlayer = trackedScores.filter(Boolean).length > 0;
    const isLeagueMatch = Boolean('leagueid' in match && match.leagueid);
    const doParse = hasTrackedPlayer || isLeagueMatch;
    if (doParse) {
      redisCount('auto_parse');
      let priority = 5;
      if (isLeagueMatch) {
        priority = -1;
      }
      if (hasTrackedPlayer) {
        priority = -2;
      }
      // We might have to retry since it might be too soon for the replay
      let attempts = 50;
      const job = await addReliableJob(
        {
          name: 'parse',
          data: {
            match_id: match.match_id,
            origin: options.origin,
          },
        },
        {
          priority,
          attempts,
          trx,
        },
      );
      return job;
    }
    return null;
  }
}

export async function upsertPlayerCaches(
  match: InsertMatchInput | ParsedMatch | Match,
  averageRank: number | undefined,
  pgroup: PGroup,
  type: DataType,
) {
  // Add the 10 player_match rows indexed by player
  // We currently do this on all types
  const copy = createMatchCopy<Match>(match);
  if (averageRank) {
    copy.average_rank = averageRank;
  }
  const columns = await getCassandraColumns('player_caches');
  return Promise.all(
    copy.players.map(async (p) => {
      // add account id to each player so we know what caches to update
      const account_id = pgroup[p.player_slot]?.account_id;
      // join player with match to form player_match
      const playerMatch: Partial<ParsedPlayerMatch> = {
        ...p,
        ...copy,
        account_id,
        players: undefined,
      };
      if (
        !playerMatch.account_id ||
        playerMatch.account_id === getAnonymousAccountId()
      ) {
        return false;
      }
      if (type === 'api' || type === 'reconcile') {
        // We currently update this for the non-anonymous players in the match
        // It'll reflect the current anonymity state of the players at insertion time
        // This might lead to changes in peers counts after a fullhistory update or parse request
        // When reconciling after gcdata we will update this with non-anonymized data (but we won't reconcile for players with open match history so their peers may be incomplete)
        playerMatch.heroes = pgroup;
      }
      computeMatchData(playerMatch as ParsedPlayerMatch);
      // Remove extra properties
      Object.keys(playerMatch).forEach((key) => {
        if (!columns[key]) {
          delete playerMatch[key as keyof ParsedPlayerMatch];
        }
      });
      const serializedMatch: any = serialize(playerMatch);
      if (
        (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') &&
        (playerMatch.player_slot === 0 || type === 'reconcile')
      ) {
        await fs.writeFile(
          './json/' +
            copy.match_id +
            `_playercache_${type}_${playerMatch.player_slot}.json`,
          JSON.stringify(serializedMatch, null, 2),
        );
      }
      if (type === 'reconcile') {
        console.log(
          playerMatch.account_id,
          copy.match_id,
          playerMatch.player_slot,
        );
        redisCount('reconcile');
      }
      const query = util.format(
        'INSERT INTO player_caches (%s) VALUES (%s)',
        Object.keys(serializedMatch).join(','),
        Object.keys(serializedMatch)
          .map(() => '?')
          .join(','),
      );
      const arr = Object.keys(serializedMatch).map((k) => serializedMatch[k]);
      await cassandra.execute(query, arr, {
        prepare: true,
      });
      return true;
    }),
  );
}
