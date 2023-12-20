import moment from 'moment';
import constants from 'dotaconstants';
import util from 'util';
import fs from 'fs';
import config from '../config.js';
import queue from './queue';
import { computeMatchData } from '../util/compute';
import db from './db';
import redis from './redis';
import { es, INDEX } from './elasticsearch';
import cassandra from './cassandra';
import { getKeys, clearCache } from './cacheFunctions';
import type knex from 'knex';
import type { Client } from 'cassandra-driver';
import {
  getAnonymousAccountId,
  convert64to32,
  serialize,
  isProMatch,
  getLaneFromPosData,
  isRadiant,
  getPatchIndex,
  redisCount,
} from '../util/utility';
import apiMatch from '../test/data/details_api.json';
import apiMatchPro from '../test/data/details_api_pro.json';
import { getMatchRankTier } from './queries';
import { getPGroup } from './pgroup';

const columnInfo: AnyDict = {};
export const cassandraColumnInfo: AnyDict = {};

function doCleanRow(schema: StringDict, row: AnyDict) {
  const obj: AnyDict = {};
  Object.keys(row).forEach((key) => {
    if (key in schema) {
      obj[key] = row[key];
    }
  });
  return obj;
}
async function cleanRowPostgres(db: knex.Knex, table: string, row: AnyDict) {
  if (!columnInfo[table]) {
    const result = await db(table).columnInfo();
    columnInfo[table] = result;
  }
  return doCleanRow(columnInfo[table], row);
}
export async function cleanRowCassandra(
  cassandra: Client,
  table: string,
  row: AnyDict,
) {
  if (!cassandraColumnInfo[table]) {
    const result = await cassandra.execute(
      'SELECT column_name FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?',
      [config.NODE_ENV === 'test' ? 'yasp_test' : 'yasp', table],
    );
    cassandraColumnInfo[table] = {};
    result.rows.forEach((r) => {
      cassandraColumnInfo[table][r.column_name] = 1;
    });
  }
  return doCleanRow(cassandraColumnInfo[table], row);
}

export async function upsert(
  db: knex.Knex,
  table: string,
  insert: AnyDict,
  conflict: NumberDict,
) {
  const row = await cleanRowPostgres(db, table, insert);
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

export async function insertPlayerCache(
  match: Match,
  pgroup: PGroup,
  type: string,
) {
  const { players } = match;
  await Promise.all(
    players.map(async (p) => {
      // add account id to each player so we know what caches to update
      const account_id = pgroup[p.player_slot]?.account_id ?? p.account_id;
      // join player with match to form player_match
      const playerMatch: Partial<ParsedPlayerMatch> = {
        ...p,
        ...match,
        account_id,
        players: undefined,
      };
      if (
        !playerMatch.account_id ||
        playerMatch.account_id === getAnonymousAccountId()
      ) {
        return;
      }
      if (type === 'api') {
        // We only need this once on the original API insert
        // In the future we might update it with the improved version from gc
        playerMatch.heroes = pgroup;
      }
      computeMatchData(playerMatch as ParsedPlayerMatch);
      delete playerMatch.patch;
      delete playerMatch.region;
      const cleanedMatch = await cleanRowCassandra(
        cassandra,
        'player_caches',
        playerMatch,
      );
      const serializedMatch: any = serialize(cleanedMatch);
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
      if (
        (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') &&
        cleanedMatch.player_slot === 0
      ) {
        fs.writeFileSync(
          './json/' +
            match.match_id +
            `_playercache_${type}_${playerMatch.player_slot}.json`,
          JSON.stringify(cleanedMatch, null, 2),
        );
      }
    }),
  );
}

function createMatchCopy(match: any): Match {
  // Makes a deep copy of the original match
  const copy = JSON.parse(JSON.stringify(match));
  return copy;
}

export type ApiMatch = (typeof apiMatch)['result'];
type ApiMatchPro = (typeof apiMatchPro)['result'];
type ApiPlayer = ApiMatch['players'][number] & {
  ability_upgrades_arr?: number[];
};
type InsertMatchInput = ApiMatch | ApiMatchPro | ParserMatch | GcMatch;

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
  async function upsertMatchPostgres(match: ApiMatchPro | ParsedMatch) {
    // Insert the pro match data: We do this if api or parser
    if (options.type !== 'api' && options.type !== 'parsed') {
      return;
    }
    if (options.type === 'api' && !isProMatch(match as Match)) {
      // Check whether we care about this match for pro purposes
      // We need the basic match data to run the check, so only do it if type is api
      return;
    }
    // Check if leagueid is premium/professional
    const result = match.leagueid
      ? await db.raw(
          `select leagueid from leagues where leagueid = ? and (tier = 'premium' OR tier = 'professional')`,
          [match.leagueid],
        )
      : null;
    currentProMatch = result?.rows?.length > 0;
    if (!currentProMatch) {
      // Skip this if not a pro match
      return;
    }
    async function upsertMatch() {
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
            pm.lane = laneData.lane || null;
            pm.lane_role = laneData.lane_role || null;
            pm.is_roaming = laneData.is_roaming || null;
          }
          return upsert(trx, 'player_matches', pm, {
            match_id: pm.match_id,
            player_slot: pm.player_slot,
          });
        }),
      );
    }
    async function upsertPicksBans() {
      await Promise.all(
        (match.picks_bans || []).map((p) => {
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
    async function upsertMatchPatch() {
      if (match.start_time) {
        await upsert(
          trx,
          'match_patch',
          {
            match_id: match.match_id,
            patch: constants.patch[getPatchIndex(match.start_time)].name,
          },
          {
            match_id: match.match_id,
          },
        );
      }
    }
    async function upsertTeamMatch() {
      const arr = [];
      if (match.radiant_team_id) {
        arr.push({
          team_id: match.radiant_team_id,
          match_id: match.match_id,
          radiant: true,
        });
      }
      if (match.dire_team_id) {
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
        match.radiant_team_id &&
        match.dire_team_id &&
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
  }
  async function upsertMatchCassandra(match: InsertMatchInput) {
    // TODO (blobstore) delete this when we verify all old match data in matches/player_matches has been archived
    // We do this regardless of type (with different sets of fields)
    const cleaned = await cleanRowCassandra(cassandra, 'matches', match);
    const obj: any = serialize(cleaned);
    if (!Object.keys(obj).length) {
      return;
    }
    const query = util.format(
      'INSERT INTO matches (%s) VALUES (%s)',
      Object.keys(obj).join(','),
      Object.keys(obj)
        .map(() => '?')
        .join(','),
    );
    const arr = Object.keys(obj).map((k) =>
      obj[k] === 'true' || obj[k] === 'false' ? JSON.parse(obj[k]) : obj[k],
    );
    await cassandra.execute(query, arr, {
      prepare: true,
    });
    await Promise.all(
      match.players.map(async (p) => {
        const pm = { ...p, match_id: match.match_id };
        const cleanedPm = await cleanRowCassandra(
          cassandra,
          'player_matches',
          pm,
        );
        const obj2: any = serialize(cleanedPm);
        if (!Object.keys(obj2).length) {
          return;
        }
        const query2 = util.format(
          'INSERT INTO player_matches (%s) VALUES (%s)',
          Object.keys(obj2).join(','),
          Object.keys(obj2)
            .map(() => '?')
            .join(','),
        );
        const arr2 = Object.keys(obj2).map((k) =>
          obj2[k] === 'true' || obj2[k] === 'false'
            ? JSON.parse(obj2[k])
            : obj2[k],
        );
        await cassandra.execute(query2, arr2, {
          prepare: true,
        });
      }),
    );
  }
  async function updateCassandraPlayerCaches(match: InsertMatchInput) {
    // Add the 10 player_match rows indexed by player
    // We currently do this on all types
    const copy = createMatchCopy(match);
    if (average_rank) {
      copy.average_rank = average_rank;
    }
    await insertPlayerCache(copy, pgroup, options.type);
  }
  async function upsertMatchBlobs(match: InsertMatchInput) {
    // This is meant to eventually replace the cassandra match/player_match tables
    // It's a table holding data for each possible stage of ingestion, api/gcdata/replay/meta etc.
    // We store a match blob in the row for each stage
    // in buildMatch we can assemble the data from all these pieces
    // After some retention period we stick the assembled blob in match archive and delete it
    const copy = createMatchCopy(match);
    if (average_rank) {
      copy.average_rank = average_rank;
    }
    copy.players.forEach((p) => {
      // There are a bunch of fields in the API response we also don't use, e.g. "scaled_hero_damage"
      delete p.scaled_hero_damage;
      delete p.scaled_tower_damage;
      delete p.scaled_hero_healing;
      // We can keep scepter/shard/moonshard from API and then we're not as reliant on permanent_buffs from GC
      // delete p.aghanims_scepter;
      // delete p.aghanims_shard;
      // delete p.moonshard;
    });
    await cassandra.execute(
      `INSERT INTO match_blobs(match_id, ${options.type}) VALUES(?, ?)`,
      [copy.match_id, JSON.stringify(copy)],
      {
        prepare: true,
      },
    );
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
      fs.writeFileSync(
        './json/' + match.match_id + '_' + options.type + '.json',
        JSON.stringify(copy, null, 2),
      );
    }
  }
  async function telemetry(match: InsertMatchInput) {
    // Publish to log stream
    const name = process.env.name || process.env.ROLE || process.argv[1];
    const message = `[${new Date().toISOString()}] [${name}] insert [${
      options.type
    }] for ${match.match_id} ended ${moment.unix(endedAt ?? 0).fromNow()}`;
    redis.publish(options.type, message);
    if (options.type === 'parsed') {
      redisCount(redis, 'parser');
    }
    if (options.origin === 'scanner' && options.type === 'api') {
      redisCount(redis, 'added_match');
    }
  }
  async function clearRedisMatch(match: InsertMatchInput) {
    // Clear out the Redis caches, we do this regardless of insert type
    await redis.del(`match:${match.match_id}`);
  }
  async function clearRedisPlayer(match: InsertMatchInput) {
    const arr: { key: string; account_id: string }[] = [];
    match.players.forEach((player) => {
      getKeys().forEach((key) => {
        if (player.account_id) {
          arr.push({ key, account_id: player.account_id?.toString() });
        }
      });
    });
    await Promise.all(arr.map((val) => clearCache(val)));
  }
  async function decideCounts(match: ApiMatch) {
    // We only do this if fresh match
    if (options.skipCounts) {
      return;
    }
    if (options.origin === 'scanner' && options.type === 'api') {
      await queue.addJob({
        name: 'countsQueue',
        data: match as unknown as Match,
      });
    }
  }
  async function decideMmr(match: ApiMatch) {
    // We only do this if fresh match and ranked
    const arr = match.players.filter((p) => {
      return (
        options.origin === 'scanner' &&
        options.type === 'api' &&
        match.lobby_type === 7 &&
        p.account_id &&
        p.account_id !== getAnonymousAccountId() &&
        config.ENABLE_RANDOM_MMR_UPDATE
      );
    });
    await Promise.all(
      arr.map((p) =>
        queue.addJob({
          name: 'mmrQueue',
          data: {
            match_id: match.match_id,
            account_id: p.account_id as number,
          },
        }),
      ),
    );
  }
  async function decideProfile(match: InsertMatchInput) {
    // We only do this if fresh match
    const arr = match.players.filter((p) => {
      return (
        match.match_id % 100 < Number(config.SCANNER_PLAYER_PERCENT) &&
        options.origin === 'scanner' &&
        options.type === 'api' &&
        p.account_id &&
        p.account_id !== getAnonymousAccountId()
      );
    });
    // Add a placeholder player with just the ID
    // We could also queue a profile job here but seems like a lot to update name after each match
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
  async function decideGcData(match: ApiMatch) {
    // We only do this for fresh matches
    // Don't get replay URLs for event matches
    if (
      options.origin === 'scanner' &&
      options.type === 'api' &&
      match.game_mode !== 19 &&
      match.match_id % 100 < Number(config.GCDATA_PERCENT)
    ) {
      await queue.addJob({
        name: 'gcQueue',
        data: {
          match_id: match.match_id,
          pgroup,
        },
      });
    }
  }
  async function decideScenarios(match: InsertMatchInput) {
    // Decide if we want to do scenarios (requires parsed match)
    // Only if it originated from scanner to avoid triggering on requests
    if (
      options.origin === 'scanner' &&
      options.type === 'parsed' &&
      match.match_id % 100 < config.SCENARIOS_SAMPLE_PERCENT
    ) {
      await queue.addJob({
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
  async function decideReplayParse(match: ApiMatch) {
    // Params like skipParse and forceParse determine whether we want to parse or not
    // Otherwise this assumes a fresh match and checks to see if pro or tracked player
    // Returns the created parse job (or null)
    if (options.skipParse || match.game_mode === 19) {
      // skipped or event games
      // not parsing this match
      return null;
    }
    // determine if any player in the match is tracked
    const trackedScores = await Promise.all(
      match.players.map((p) => {
        return redis.zscore('tracked', String(p.account_id));
      }),
    );
    let hasTrackedPlayer = trackedScores.filter(Boolean).length > 0;
    const doParse = hasTrackedPlayer || currentProMatch || options.forceParse;
    if (!doParse) {
      return null;
    }
    let priority = options.priority;
    if (match.leagueid) {
      priority = -1;
    }
    if (hasTrackedPlayer) {
      priority = -2;
    }
    const job = await queue.addReliableJob(
      {
        name: 'parse',
        data: {
          match_id: match.match_id,
          origin: options.origin,
        },
      },
      {
        priority,
        attempts: options.attempts || 30,
      },
    );
    if (options.origin === 'scanner' && options.type === 'api') {
      redisCount(redis, 'auto_parse');
    }
    return job;
  }

  let currentProMatch = false;

  // Make a copy of the match with some modifications
  const match: Readonly<InsertMatchInput> = {
    ...origMatch,
    players: origMatch.players.map((p) => {
      const newP = { ...p } as Partial<ApiPlayer>;
      if (newP.account_id === getAnonymousAccountId()) {
        // don't insert anonymous account id
        delete newP.account_id;
      }
      if (newP.ability_upgrades) {
        // Reduce the ability upgrades info into ability_upgrades_arr (just an array of numbers)
        newP.ability_upgrades_arr = newP.ability_upgrades.map(
          (au: any) => au.ability,
        );
        delete newP.ability_upgrades;
      }
      return newP as any;
    }),
  };
  // Use the passed pgroup if gcdata or parsed, otherwise build it
  // Do this after removing anonymous account IDs
  const pgroup = options.pgroup ?? getPGroup(match as ApiMatch);
  const endedAt =
    options.endedAt ??
    (match as ApiMatch).start_time + (match as ApiMatch).duration;

  let average_rank: number | undefined = undefined;
  // Only fetch the average_rank if this is a fresh match since otherwise it won't be accurate
  // We currently only store this in the player_caches table, not in the match itself
  if (options.origin === 'scanner' && options.type === 'api') {
    const { avg } = await getMatchRankTier(match.players);
    if (avg) {
      average_rank = avg;
    }
  }

  await upsertMatchPostgres(match as ApiMatchPro | ParsedMatch);
  await upsertMatchCassandra(match);
  await updateCassandraPlayerCaches(match);
  await upsertMatchBlobs(match);
  await clearRedisMatch(match);
  await clearRedisPlayer(match);
  await telemetry(match);
  await decideCounts(match as ApiMatch);
  await decideMmr(match as ApiMatch);
  await decideProfile(match);
  await decideGcData(match as ApiMatch);
  await decideScenarios(match);
  await postParsedMatch(match);
  const parseJob = await decideReplayParse(match as ApiMatch);
  return parseJob;
}
