import moment from 'moment';
import config from '../config.js';
import { insertMatchPromise, upsertPromise } from './queries';
import db from './db';
import redis from './redis';
import cassandra from './cassandra';
import { getDataPromise, getRetrieverArr, redisCount } from '../util/utility';
const secret = config.RETRIEVER_SECRET;

async function fetchGcData(match: GcDataJob): Promise<void> {
  // Make the GC call to populate the data
  const retrieverArr = getRetrieverArr(match.useGcDataArr);
  // make array of retriever urls and use a random one on each retry
  const urls = retrieverArr.map(
    (r) => `http://${r}?key=${secret}&match_id=${match.match_id}`
  );
  const body = await getDataPromise({
    url: urls,
    noRetry: match.noRetry,
    timeout: 5000,
  });
  if (!body || !body.match || !body.match.replay_salt || !body.match.players) {
    // non-retryable error
    // redis.lpush('nonRetryable', JSON.stringify({ matchId: match.match_id, body }));
    // redis.ltrim('nonRetryable', 0, 10000);
    throw new Error('invalid body');
  }
  // Count retriever calls
  redisCount(redis, 'retriever');
  redis.zincrby('retrieverCounts', 1, 'retriever');
  redis.expireat(
    'retrieverCounts',
    moment().startOf('hour').add(1, 'hour').format('X')
  );
  // NOTE: account ids are not anonymous in this call so we don't include it in the data to insert
  // We could start storing this data but then the API also needs to respect the user's match history setting
  const players = body.match.players.map((p: any, i: number): GcPlayer => ({
    player_slot: p.player_slot,
    party_id: p.party_id?.low,
    permanent_buffs: p.permanent_buffs,
    party_size: body.match.players.filter(
      (matchPlayer: any) => matchPlayer.party_id?.low === p.party_id?.low
    ).length,
  }));
  const matchToInsert: GcMatch = {
    match_id: match.match_id,
    pgroup: match.pgroup,
    players,
    series_id: body.match.series_id,
    series_type: body.match.series_type,
    // With match_id, cluster, and replay salt we can construct a replay URL
    cluster: body.match.cluster,
    replay_salt: body.match.replay_salt,
  };
  const gcdata = {
    match_id: Number(match.match_id),
    cluster: body.match.cluster,
    replay_salt: body.match.replay_salt,
  };
  // TODO (howard) deprecate match_gcdata once we have transferGcData for pro matches
  // Persist GC data to database, we'll read it back from here for consumers
  await upsertPromise(db, 'match_gcdata', gcdata, {
    match_id: match.match_id,
  });
  // Update series id and type for pro match
  await db.raw(
    'UPDATE matches SET series_id = ?, series_type = ?, cluster = ?, replay_salt = ? WHERE match_id = ?',
    [matchToInsert.series_id, matchToInsert.series_type, matchToInsert.cluster, matchToInsert.replay_salt, match.match_id]
  );
  // Put extra fields in matches/player_matches (do last since after this we won't fetch from GC again)
  await insertMatchPromise(matchToInsert, {
    type: 'gcdata',
    skipParse: true,
  });
  return;
}

type GcDataRow = { match_id: number; cluster: number; replay_salt: number };

/**
 * Tries to return GC data by reading it without fetching.
 * @param matchId 
 * @returns 
 */
export async function tryReadGcData(
  matchId: number
): Promise<GcDataRow | undefined> {
  const result = await cassandra.execute(
    'SELECT gcdata FROM match_blobs WHERE match_id = ?',
    [matchId],
    { prepare: true, fetchSize: 1, autoPage: true }
  );
  const row = result.rows[0];
  const gcData: GcData = row?.gcdata ? JSON.parse(row.gcdata) : undefined;
  return { match_id: gcData.match_id, cluster: gcData.cluster, replay_salt: gcData.replay_salt };
}

/**
 * Returns GC data, fetching and saving it if we don't have it already.
 * Throws if we can't find it
 * @param match 
 * @returns 
 */
export async function getGcData(
  match: GcDataJob
): Promise<GcDataRow> {
  const matchId = match.match_id;
  if (!matchId || Number.isNaN(Number(matchId)) || Number(matchId) <= 0) {
    throw new Error('invalid match_id');
  }
  // Check if we have gcdata cached
  const saved = await tryReadGcData(matchId);
  if (saved) {
    redisCount(redis, 'cached_gcdata');
    if (config.DISABLE_REGCDATA) {
      // use the saved value
      return saved;
    }
  }
  // If we got here we don't have it saved or want to refetch
  await fetchGcData(match);
  const result = await tryReadGcData(matchId);
  if (!result) {
    throw new Error('[GCDATA]: Could not get GC data for match ' + match.match_id);
  }
  return result;
}
