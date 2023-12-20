import moment from 'moment';
import config from '../config.js';
import { insertMatch, readGcData, upsert } from './queries';
import db from './db';
import redis from './redis';
import { getRandomRetrieverUrl, redisCount } from '../util/utility';
import axios from 'axios';
import retrieverMatch from '../test/data/retriever_match.json';

async function fillGcData(job: GcDataJob): Promise<void> {
  const matchId = job.match_id;
  const noRetry = job.noRetry;
  let retryCount = 0;
  const url = getRandomRetrieverUrl({ matchId });
  let body: typeof retrieverMatch | undefined = undefined;
  do {
    try {
      retryCount += 1;
      console.log(url, 'attempt:', retryCount);
      const { data } = await axios.get(url, { timeout: 5000 });
      body = data;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        console.log(e.toJSON());
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        throw e;
      }
    }
  } while (!body || noRetry);
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
    match_id: job.match_id,
    players,
    series_id: body.match.series_id,
    series_type: body.match.series_type,
    // With match_id, cluster, and replay salt we can construct a replay URL
    cluster: body.match.cluster,
    replay_salt: body.match.replay_salt,
  };
  const gcdata = {
    match_id: Number(job.match_id),
    cluster: body.match.cluster,
    replay_salt: body.match.replay_salt,
  };
  // TODO (howard) deprecate match_gcdata once we have transferGcData for pro matches
  // Persist GC data to database, we'll read it back from here for consumers
  await upsert(db, 'match_gcdata', gcdata, {
    match_id: job.match_id,
  });
  // Update series id and type for pro match
  await db.raw(
    'UPDATE matches SET series_id = ?, series_type = ?, cluster = ?, replay_salt = ? WHERE match_id = ?',
    [
      matchToInsert.series_id,
      matchToInsert.series_type,
      matchToInsert.cluster,
      matchToInsert.replay_salt,
      job.match_id,
    ],
  );
  // Put extra fields in matches/player_matches (do last since after this we won't fetch from GC again)
  await insertMatch(matchToInsert, {
    type: 'gcdata',
    skipParse: true,
    pgroup: job.pgroup,
    endedAt: body.match.starttime + body.match.duration,
  });
  return;
}

/**
 * Returns GC data, fetching and saving it if we don't have it already.
 * Throws if we can't find it
 * @param job
 * @returns
 */
export async function getGcData(job: GcDataJob): Promise<GcMatch> {
  const matchId = job.match_id;
  if (!matchId || !Number.isInteger(Number(matchId)) || Number(matchId) <= 0) {
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
  await fillGcData(job);
  const result = await readGcData(matchId);
  if (!result) {
    throw new Error(
      '[GCDATA]: Could not get GC data for match ' + job.match_id,
    );
  }
  return result;
}
