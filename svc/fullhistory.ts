// Processes a queue of full history/refresh requests for players
import config from '../config.ts';
import { getSteamAPIDataWithRetry, SteamAPIUrls } from './util/utility.ts';
import db from './store/db.ts';
import { runReliableQueue } from './store/queue.ts';
import { getPlayerMatches } from './util/buildPlayer.ts';
import redis, { redisCount } from './store/redis.ts';

// Approximately 5 req/sec limit per apiHost
// Short fullhistory uses 1 req, long 5 req, some percentage will need to query for up to 500 matches
runReliableQueue(
  'fhQueue',
  Number(config.FULLHISTORY_PARALLELISM) || 1,
  processFullHistory,
  // Currently not using proxy so don't need to throttle capacity
  // async () => redis.zcard('registry:proxy') * 5,
);

async function processFullHistory(job: FullHistoryJob, metadata: JobMetadata) {
  const player = job;
  if (
    Number(player.account_id) === 0 ||
    Number.isNaN(Number(player.account_id))
  ) {
    return true;
  }

  // If this player has already recently been processed, don't do it again
  if (
    config.NODE_ENV !== 'development' &&
    (await redis.get('fh_queue:' + player.account_id))
  ) {
    redisCount('fullhistory_skip');
    console.log('[FULLHISTORY#%s] skipping %s', metadata.i, player.account_id);
    return true;
  }

  console.time(`doFullHistory#${metadata.i}:` + player.account_id.toString());
  // As of December 2021 filtering by hero ID doesn't work
  // const heroArray = config.NODE_ENV === 'test' ? ['0'] : Object.keys(heroes);
  // const heroId = '0';
  // use steamapi via specific player history and specific hero id (up to 500 games per hero)
  const matchesToProcess: Record<string, ApiData> = {};
  let isMatchDataDisabled = null;
  let url = SteamAPIUrls.api_history({
    account_id: player.account_id,
    matches_requested: 100,
  });
  // Fetch 1-5 pages of matches for the player
  while (true) {
    let body = await getSteamAPIDataWithRetry({ url, proxy: true });
    // check for specific error code if user had a private account
    if (body?.result?.status === 15) {
      console.log('player %s disabled match history', player.account_id);
      isMatchDataDisabled = true;
      break;
    } else if (body?.result?.matches) {
      isMatchDataDisabled = false;
    }
    const resp = body.result.matches;
    let nextId = 0;
    resp.forEach((match: any) => {
      const matchId = match.match_id;
      matchesToProcess[matchId] = match;
      nextId = match.match_id;
    });
    const rem = body.result.results_remaining;
    if (rem === 0 || resp.length === 0) {
      // Stop here if we only want one page/100 matches (short history)
      // As of March 2025 high level matches are removed from results but still counted in results_remaining
      // no more pages
      break;
    }
    // paginate through to max 500 games if necessary with start_at_match_id=
    url = SteamAPIUrls.api_history({
      account_id: player.account_id,
      matches_requested: 100,
      start_at_match_id: nextId - 1,
    });
  }
  if (Object.keys(matchesToProcess).length > 0) {
    // check what matches the player is already associated with
    const docs =
      (await getPlayerMatches(player.account_id, {
        project: ['match_id'],
        // Only need to check against recent matches since we get back the most recent 500 or 100 matches from Steam API
        dbLimit: 1000,
      })) ?? [];
    const origCount = Object.keys(matchesToProcess).length;
    // iterate through db results, delete match_id key if this player has this match already
    // will re-request and update matches where this player was previously anonymous
    for (let i = 0; i < docs.length; i += 1) {
      const matchId = docs[i].match_id;
      delete matchesToProcess[matchId];
    }
    console.log(
      '%s: %s matches found, diffing %s from db, %s to add',
      player.account_id,
      origCount,
      docs.length,
      Object.keys(matchesToProcess).length,
    );
    const keys = Object.keys(matchesToProcess);
    for (let i = 0; i < keys.length; i++) {
      const match = matchesToProcess[keys[i]];
      const playerSlot = match.players.find(
        (p) => p.account_id === player.account_id,
      )?.player_slot;
      if (playerSlot == null) {
        continue;
      }
      const row = {
        account_id: player.account_id,
        match_id: match.match_id,
        player_slot: playerSlot,
      };
      // Note: If an account ID shows up here that player is not anonymous anymore (could update fh_unavailable for other players)
      // Log the match IDs we should reconcile, we can query our own DB for data
      const { rows } = await db.raw(
        'INSERT INTO player_match_history(account_id, match_id, player_slot) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING *',
        [row.account_id, row.match_id, row.player_slot],
      );
      if (rows?.length) {
        await redisCount('pmh_fullhistory');
      }
    }
  }
  if (isMatchDataDisabled != null) {
    player.fh_unavailable = isMatchDataDisabled;
  }
  await updatePlayer(player);
  await redis.setex('fh_queue:' + player.account_id, 30 * 60, '1');
  console.timeEnd(`doFullHistory#${metadata.i}:` + player.account_id.toString());
  return true;
}

async function updatePlayer(player: FullHistoryJob) {
  // done with this player, update
  await db('players')
    .update({
      full_history_time: new Date(),
      fh_unavailable: player.fh_unavailable,
    })
    .where({
      account_id: player.account_id,
    });
  redisCount('fullhistory');
}
