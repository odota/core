// Processes a queue of full history/refresh requests for players
import urllib from 'url';
import config from '../config';
import {
  redisCount,
  getSteamAPIData,
  SteamAPIUrls,
} from '../util/utility';
import db from '../store/db';
import { runQueue } from '../store/queue';
import { getPlayerMatches } from '../util/buildPlayer';
import type { ApiMatch } from '../util/types';

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
  if (!player.long_history) {
    redisCount('fullhistory_short');
  }
}

async function processFullHistory(job: FullHistoryJob) {
  const player = job;
  if (
    Number(player.account_id) === 0 ||
    Number.isNaN(Number(player.account_id))
  ) {
    return;
  }

  console.time('doFullHistory: ' + player.account_id.toString());
  // by default, fetch only 100 matches, unless long_history is specified then fetch 500
  // As of December 2021 filtering by hero ID doesn't work
  // const heroArray = config.NODE_ENV === 'test' ? ['0'] : Object.keys(heroes);
  // const heroId = '0';
  // use steamapi via specific player history and specific hero id (up to 500 games per hero)
  const matchesToProcess: Record<string, ApiMatch> = {};
  let isMatchDataDisabled = null;
  // make a request for every possible hero
  const url = SteamAPIUrls.api_history({
    account_id: player.account_id,
    matches_requested: 100,
  });
  const getApiMatchPage = async (
    player: FullHistoryJob,
    url: string,
  ): Promise<void> => {
    let body;
    while (!body) {
      try {
        body = await getSteamAPIData({ url });
      } catch (err: any) {
        // Can retry on transient error
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // check for specific error code if user had a private account, if so, update player and don't retry
    if (body?.result?.status === 15) {
      console.log('player %s disabled match history', player.account_id);
      isMatchDataDisabled = true;
      return;
    }

    // response for match history for single player
    const resp = body.result.matches;
    let startId = 0;
    resp.forEach((match: any) => {
      // add match ids on each page to match_ids
      const matchId = match.match_id;
      matchesToProcess[matchId] = match;
      startId = match.match_id;
    });
    const rem = body.result.results_remaining;

    if (rem === 0 || !player.long_history) {
      // no more pages
      return;
    }
    // paginate through to max 500 games if necessary with start_at_match_id=
    const parse = urllib.parse(url, true);
    parse.query.start_at_match_id = (startId - 1).toString();
    parse.search = null;
    url = urllib.format(parse);
    return getApiMatchPage(player, url);
  };
  // Fetches 1-5 pages of matches for the players and updates the match_ids object
  await getApiMatchPage(player, url);
  if (Object.keys(matchesToProcess).length > 0) {
    isMatchDataDisabled = false;
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
      // Disabled due to Steam GetMatchDetails being broken
      // This would update the match blob with the visibility and update player caches to make them show up under a player
      // Could possibly queue these matches for GC data fetch and then trigger a reconciliation from our own DB (similar to proposed change after parsing a match)
      // const url = SteamAPIUrls.api_details({
      //   match_id: Number(matchId),
      // });
      // const body = await getSteamAPIData({ url });
      // const match = body.result;
      // Don't insert match blob to avoid overwriting with less data from API
      // Only update player_caches to associate the match with players
      // await insertMatch(match, {
      //   type: 'api',
      //   cacheOnly: true,
      // });
      // await new Promise((resolve) => setTimeout(resolve, 1000));
      const match = matchesToProcess[keys[i]];
      const playerSlot = match.players.find(p => p.account_id === player.account_id)?.player_slot;
      if (playerSlot == null) {
        continue;
      }
      const row = { account_id: player.account_id, match_id: match.match_id, player_slot: playerSlot };
      // Note: If an account ID shows up here that player is not anonymous anymore (could update fh_unavailable for other players)
      // Log the match IDs we should reconcile, we can query our own DB for data
      await db.raw('INSERT INTO player_match_history(account_id, match_id, player_slot) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [row.account_id, row.match_id, row.player_slot]);
      await redisCount('pmh_fullhistory');
    }
  }
  if (isMatchDataDisabled != null) {
    player.fh_unavailable = isMatchDataDisabled;
  }
  await updatePlayer(player);
  console.timeEnd('doFullHistory: ' + player.account_id.toString());
}

// Approximately 5 req/sec limit per apiHost
// Short fullhistory uses 1 req, long 5 req, some percentage will need to query for up to 500 matches
runQueue(
  'fhQueue',
  Number(config.FULLHISTORY_PARALLELISM) || 1,
  processFullHistory,
  // Currently not using proxy so don't need to throttle capacity
  // async () => redis.zcard('registry:proxy') * 5,
);
