import moment from 'moment';
import { patch } from 'dotaconstants';
import util from 'node:util';
import { promises as fs } from 'fs';
import config from '../../config';
import { addJob, addReliableJob } from '../store/queue';
import db, { getPostgresColumns } from '../store/db';
import redis from '../store/redis';
import { es, INDEX } from '../store/elasticsearch';
import type knex from 'knex';
import {
  getAnonymousAccountId,
  convert64to32,
  serialize,
  isProMatch,
  getLaneFromPosData,
  isRadiant,
  getPatchIndex,
  redisCount,
  transformMatch,
  createMatchCopy,
} from './utility';
import {
  getMatchRankTier,
  isRecentVisitor,
  isRecentlyVisited,
} from './queries';
import { getPGroup } from './pgroup';
import { blobArchive } from '../store/archive';
import type { ApiMatch, ApiPlayer, InsertMatchInput } from './types';
import { upsertPlayerCaches } from './playerCaches';

moment.relativeTimeThreshold('ss', 0);

export async function upsert(
  db: knex.Knex,
  table: string,
  insert: AnyDict,
  conflict: NumberDict,
) {
  const columns = await getPostgresColumns(table);
  const row = { ...insert };
  // Remove extra properties
  Object.keys(row).forEach((key) => {
    if (!columns[key]) {
      delete row[key];
    }
  });
  const values = Object.keys(row).map(() => '?');
  const update = Object.keys(row).map((key) =>
    util.format('%s=%s', key, `EXCLUDED.${key}`),
  );
  const query = util.format(
    'INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET %s',
    table,
    Object.keys(row).join(','),
    values.join(','),
    Object.keys(conflict).join(','),
    update.join(','),
  );
  return db.raw(
    query,
    Object.keys(row).map((key) => row[key]),
  );
}

export async function upsertPlayer(
  db: knex.Knex,
  player: Partial<User>,
  indexPlayer: boolean,
) {
  if (player.steamid) {
    // this is a login, compute the account_id from steamid
    player.account_id = Number(convert64to32(player.steamid));
  }
  if (!player.account_id || player.account_id === getAnonymousAccountId()) {
    return;
  }
  if (indexPlayer) {
    //@ts-ignore
    await es.update({
      index: INDEX,
      type: 'player',
      id: player.account_id,
      body: {
        doc: {
          personaname: player.personaname,
          avatarfull: player.avatarfull,
        },
        doc_as_upsert: true,
      },
    });
  }
  return upsert(db, 'players', player, {
    account_id: player.account_id,
  });
}

export async function bulkIndexPlayer(bulkActions: any[]) {
  // Bulk call to ElasticSearch
  if (bulkActions.length > 0) {
    await es.bulk({
      body: bulkActions,
      index: INDEX,
      type: 'player',
    });
  }
}

export async function insertPlayerRating(row: PlayerRating) {
  if (row.rank_tier) {
    await upsert(
      db,
      'rank_tier',
      { account_id: row.account_id, rating: row.rank_tier },
      { account_id: row.account_id },
    );
  }
  if (row.leaderboard_rank) {
    await upsert(
      db,
      'leaderboard_rank',
      {
        account_id: row.account_id,
        rating: row.leaderboard_rank,
      },
      { account_id: row.account_id },
    );
  }
}

export async function queueReconcile(
  gcMatch: GcMatch | null,
  pgroup: PGroup,
  metricName: MetricName,
) {
  if (gcMatch) {
    // Log the players who were previously anonymous for reconciliation
    await Promise.all(
      gcMatch.players
        .filter((p) => !Boolean(pgroup[p.player_slot]?.account_id))
        .map(async (p) => {
          if (p.account_id) {
            await db.raw(
              'INSERT INTO player_match_history(account_id, match_id, player_slot) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
              [p.account_id, gcMatch.match_id, p.player_slot],
            );
            await redisCount(metricName);
          }
        }),
    );
  }
}

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
  async function upsertMatchPostgres(match: InsertMatchInput) {
    if (options.type !== 'api' && options.type !== 'parsed') {
      // Only if API or parse data
      return;
    }
    if (options.type === 'api' && !isProMatch(match as ApiMatch)) {
      // Check whether we care about this match for pro purposes
      // We need the basic match data to run the check, so only do it if type is api
      // console.log('[UPSERTMATCHPOSTGRES]: skipping due to check');
      return;
    }
    // If parsed data, we want to make sure the match exists in DB
    // Otherwise we could end up with parsed data only rows for matches we skipped above
    // We might want to switch the upsert to UPDATE instead for parsed case
    // That requires writing a new SQL query though
    // If we do that then we can put the NOT NULL constraint on hero_id
    if (options.type === 'parsed') {
      const { rows } = await db.raw(
        'select match_id from matches where match_id = ?',
        [match.match_id],
      );
      if (!rows.length) {
        return;
      }
    }
    if (!isProLeague) {
      // Skip if not in a pro league (premium or professional tier)
      console.log('[UPSERTMATCHPOSTGRES]: skipping due to league');
      return;
    }
    const trx = await db.transaction();
    try {
      await upsertMatch();
      await upsertPlayerMatches();
      await upsertPicksBans();
      await upsertMatchPatch();
      await upsertTeamMatch();
      await updateTeamRankings();
    } catch (e) {
      trx.rollback();
      throw e;
    }
    await trx.commit();

    async function upsertMatch() {
      console.log('[UPSERTMATCHPOSTGRES]: match');
      await upsert(trx, 'matches', match, {
        match_id: match.match_id,
      });
    }
    async function upsertPlayerMatches() {
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
          console.log(
            '[UPSERTMATCHPOSTGRES]: player_match',
            pm.match_id,
            pm.player_slot,
            pm.hero_id,
          );
          return upsert(trx, 'player_matches', pm, {
            match_id: pm.match_id,
            player_slot: pm.player_slot,
          });
        }),
      );
    }
    async function upsertPicksBans() {
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
    }
    async function upsertMatchPatch() {
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
    }
    async function upsertTeamMatch() {
      const arr = [];
      if ('radiant_team_id' in match && match.radiant_team_id) {
        arr.push({
          team_id: match.radiant_team_id,
          match_id: match.match_id,
          radiant: true,
        });
      }
      if ('dire_team_id' in match && match.dire_team_id) {
        arr.push({
          team_id: match.dire_team_id,
          match_id: match.match_id,
          radiant: false,
        });
      }
      await Promise.all(
        arr.map((tm) => {
          return upsert(trx, 'team_match', tm, {
            team_id: tm.team_id,
            match_id: tm.match_id,
          });
        }),
      );
    }
    async function updateTeamRankings() {
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
  }
  async function upsertMatchBlobs(match: InsertMatchInput) {
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

  async function telemetry(match: InsertMatchInput) {
    // Publish to log stream
    const endedAt =
      options.endedAt ??
      ('start_time' in match && 'duration' in match
        ? match.start_time + match.duration
        : 0);
    const name = process.env.name || process.env.ROLE || process.argv[1];
    const message = `[${new Date().toISOString()}] [${name}] [insert: ${
      options.type
    }] [ended: ${moment.unix(endedAt ?? 0).fromNow()}] ${match.match_id}`;
    redis.publish(options.type, message);
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
  async function resetMatchCache(match: InsertMatchInput) {
    if (config.ENABLE_MATCH_CACHE) {
      await redis.del(`match:${match.match_id}`);
    }
  }
  async function resetPlayerTemp(match: InsertMatchInput) {
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
  async function decideCounts(match: InsertMatchInput) {
    // Update temporary match counts/hero rankings
    if (options.origin === 'scanner' && options.type === 'api') {
      await addJob({
        name: 'countsQueue',
        data: match as ApiMatch,
      });
    }
  }
  async function decideMmr(match: InsertMatchInput) {
    // Trigger an update for player rank_tier if ranked match
    const arr = match.players.filter<ApiPlayer>((p): p is ApiPlayer => {
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
  async function decideProfile(match: InsertMatchInput) {
    // Player discovery
    // Add a placeholder player with just the ID
    // We could also trigger profile update here but we probably don't need to update name after each match
    // The profiler process will update profiles randomly
    // We can also discover players from gcdata where they're not anonymous
    const arr = match.players.filter((p) => {
      return p.account_id && p.account_id !== getAnonymousAccountId();
    });
    await Promise.all(
      arr.map((p) =>
        // Avoid extraneous writes to player table by not using upsert function
        db.raw(
          'INSERT INTO players(account_id) VALUES(?) ON CONFLICT DO NOTHING',
          [p.account_id],
        ),
      ),
    );
  }
  async function decideGcData(match: InsertMatchInput) {
    // Trigger a request for gcdata
    if (
      options.origin === 'scanner' &&
      options.type === 'api' &&
      'game_mode' in match &&
      // Don't get replay URLs for event matches
      match.game_mode !== 19 &&
      match.match_id % 100 < Number(config.GCDATA_PERCENT)
    ) {
      if (!gcQueued) {
        await addJob({
          name: 'gcQueue',
          data: {
            match_id: match.match_id,
            pgroup,
          },
        });
        gcQueued = true;
      }
    }
  }

  async function decideRate(match: InsertMatchInput) {
    // Decide whether to rate the match
    // Rate a percentage of ranked matches
    if (options.origin === 'scanner' &&
      options.type === 'api' &&
      'lobby_type' in match &&
      match.lobby_type === 7 &&
      match.match_id % 100 < Number(config.RATING_PERCENT)
    ) {
      if (!gcQueued) {
        // Queue job for gcdata to speed up rating process
        await addJob({
          name: 'gcQueue',
          data: {
            match_id: match.match_id,
            pgroup,
          },
        });
        gcQueued = true;
      }
      await db.raw('INSERT INTO rating_queue(match_seq_num, match_id, pgroup, radiant_win) VALUES(?, ?, ?, ?) ON CONFLICT DO NOTHING', [match.match_seq_num, match.match_id, JSON.stringify(pgroup), match.radiant_win]);
    }
  }

  async function decideScenarios(match: InsertMatchInput) {
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
  async function postParsedMatch(match: InsertMatchInput) {
    if (options.type === 'parsed') {
      // Mark this match parsed
      await db.raw(
        'INSERT INTO parsed_matches(match_id) VALUES(?) ON CONFLICT DO NOTHING',
        [Number(match.match_id)],
      );
    }
  }
  async function decideReplayParse(match: InsertMatchInput) {
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
    const doParse = hasTrackedPlayer || isProLeague;
    if (!doParse) {
      return null;
    }
    redisCount('auto_parse');
    let priority = 5;
    if (isProLeague) {
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
        caller: options.origin,
      },
    );
    return job;
  }

  // Make a copy of the match with some modifications
  const match = transformMatch(origMatch);
  // Use the passed pgroup if gcdata or parsed, otherwise build it
  // Do this after removing anonymous account IDs
  const pgroup = options.pgroup ?? getPGroup(match as ApiMatch);

  let isProLeague = false;
  if ('leagueid' in match) {
    // Check if leagueid is premium/professional
    const result = match.leagueid
      ? await db.raw(
          `select leagueid from leagues where leagueid = ? and (tier = 'premium' OR tier = 'professional')`,
          [match.leagueid],
        )
      : null;
    isProLeague = result?.rows?.length > 0;
  }

  let average_rank: number | undefined = undefined;
  // Only fetch the average_rank if this is a fresh match since otherwise it won't be accurate
  if (options.origin === 'scanner' && options.type === 'api') {
    const { avg, players } = await getMatchRankTier(match.players);
    if (avg) {
      average_rank = avg;
    }
    // average_rank should be stored in a new blob column too since it's not part of API data
    // We could also store the ranks of the players here rather than looking up their current rank on view
    // That's probably better anyway since it's more accurate to show their rank at the time of the match
    // let ranksBlob = { match_id: match.match_id, average_rank, players };
    // await upsertBlob('ranks', ranksBlob);
  }

  let gcQueued = false;

  await upsertMatchPostgres(match);
  await upsertPlayerCaches(match, average_rank, pgroup, options.type);
  await upsertMatchBlobs(match);
  await resetMatchCache(match);
  await resetPlayerTemp(match);
  await telemetry(match);
  await decideCounts(match);
  await decideMmr(match);
  await decideProfile(match);
  await decideGcData(match);
  await decideRate(match);
  await decideScenarios(match);
  await postParsedMatch(match);
  const parseJob = await decideReplayParse(match);
  return { parseJob, pgroup };
}
