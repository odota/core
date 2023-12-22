import moment from 'moment';
import config from '../config';
import db from './db';
import redis from './redis';
import cassandra from './cassandra';
import { getRandomRetrieverUrl, redisCount } from '../util/utility';
import axios from 'axios';
import retrieverMatch from '../test/data/retriever_match.json';
import { insertMatch, upsert } from './insert';

/**
 * Return GC data by reading it without fetching.
 * @param matchId
 * @returns
 */
export async function readGcData(
  matchId: number,
): Promise<GcMatch | undefined> {
  const result = await cassandra.execute(
    'SELECT gcdata FROM match_blobs WHERE match_id = ?',
    [matchId],
    { prepare: true, fetchSize: 1, autoPage: true },
  );
  const row = result.rows[0];
  const gcData = row?.gcdata ? (JSON.parse(row.gcdata) as GcMatch) : undefined;
  if (!gcData) {
    return;
  }
  const { match_id, cluster, replay_salt } = gcData;
  if (!match_id || !cluster || !replay_salt) {
    return;
  }
  return gcData;
}

/**
 * Requests GC data from the retriever (optionally with retry) and saves it locally
 * @param job
 * @returns
 */
async function saveGcData(
  matchId: number,
  pgroup: PGroup,
): Promise<void> {
  const url = getRandomRetrieverUrl({ matchId });
  let body: typeof retrieverMatch | undefined = undefined;
  const { data } = await axios.get(url, { timeout: 5000 });
  body = data;
  if (!body || !body.match || !body.match.replay_salt || !body.match.players) {
    // non-retryable error
    throw new Error('invalid body');
  }
  // Count retriever calls
  redisCount(redis, 'retriever');
  redis.zincrby('retrieverCounts', 1, 'retriever');
  redis.expireat(
    'retrieverCounts',
    moment().startOf('hour').add(1, 'hour').format('X'),
  );
  const players = body.match.players.map(
    (p: any, i: number): GcPlayer => ({
      // NOTE: account ids are not anonymous in this call so we don't include it in the data to insert
      // We could start storing this data but then the API also needs to respect the user's match history setting
      // account_id: p.account_id,
      player_slot: p.player_slot,
      party_id: p.party_id?.low,
      permanent_buffs: p.permanent_buffs,
      party_size: body!.match.players.filter(
        (matchPlayer: any) => matchPlayer.party_id?.low === p.party_id?.low,
      ).length,
      // If we want to start adding basic data for anonymous players in player_caches we can put k/d/a/hd/td etc here too
      // There are some discrepancies in field names, e.g. starttime instead of start_time and item_7 instead of backpack_0
      // We'll also want to remove the extra data from being stored in gcdata column to save space
    }),
  );
  const matchToInsert: GcMatch = {
    match_id: matchId,
    players,
    series_id: body.match.series_id,
    series_type: body.match.series_type,
    // With match_id, cluster, and replay salt we can construct a replay URL
    cluster: body.match.cluster,
    replay_salt: body.match.replay_salt,
  };
  const gcdata = {
    match_id: matchId,
    cluster: body.match.cluster,
    replay_salt: body.match.replay_salt,
  };
  // TODO (howard) deprecate match_gcdata once we have transferGcData for pro matches
  // Persist GC data to database, we'll read it back from here for consumers
  await upsert(db, 'match_gcdata', gcdata, {
    match_id: matchId,
  });
  // Update series id and type for pro match
  await db.raw(
    'UPDATE matches SET series_id = ?, series_type = ?, cluster = ?, replay_salt = ? WHERE match_id = ?',
    [
      matchToInsert.series_id,
      matchToInsert.series_type,
      matchToInsert.cluster,
      matchToInsert.replay_salt,
      matchId,
    ],
  );
  // Put extra fields in matches/player_matches (do last since after this we won't fetch from GC again)
  await insertMatch(matchToInsert, {
    type: 'gcdata',
    pgroup,
    endedAt: body.match.starttime + body.match.duration,
  });
  return;
}

/**
 * Attempts once to fetch the GC data and read it back
 * @param matchId
 * @param pgroup
 * @returns The GC data, or nothing if we failed
 */
export async function tryFetchGcData(
  matchId: number,
  pgroup: PGroup,
): Promise<GcMatch | undefined> {
  try {
    await saveGcData(matchId, pgroup);
    return readGcData(matchId);
  } catch (e) {
    console.log(e);
    return;
  }
}

/**
 * Returns GC data, reading the saved version.
 * If not present, fills it and then reads it back.
 * Throws if we can't find it
 * @param job
 * @returns
 */
export async function getOrFetchGcData(
  matchId: number,
  pgroup: PGroup,
): Promise<GcMatch> {
  if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
    throw new Error('invalid match_id');
  }
  // Check if we have gcdata cached
  const saved = await readGcData(matchId);
  if (saved) {
    redisCount(redis, 'regcdata');
    if (config.DISABLE_REGCDATA) {
      // If high load, we can disable refetching gcdata
      return saved;
    }
  }
  // If we got here we don't have it saved or want to refetch
  await saveGcData(matchId, pgroup);
  const result = await readGcData(matchId);
  if (!result) {
    throw new Error('[GCDATA]: Could not get GC data for match ' + matchId);
  }
  return result;
}

export async function getOrFetchGcDataWithRetry(
  matchId: number,
  pgroup: PGroup,
): Promise<GcMatch> {
  let result: GcMatch | undefined = undefined;
  let tryCount = 1;
  while(!result) {
    try {
      result = await getOrFetchGcData(matchId, pgroup);
    } catch(e) {
      if (axios.isAxiosError(e)) {
        console.log(e.request.url, e.message);
      } else {
        console.error(e);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      tryCount += 1;
      console.log('retrying %s, attempt %s', matchId, tryCount);
    }
  }
  return result;
}