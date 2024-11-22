// Processes a queue of full history/refresh requests for players
import urllib from 'url';
import config from '../config';
import {
  redisCount,
  getSteamAPIData,
  generateJob,
  eachLimitPromise,
} from '../util/utility';
import db from '../store/db';
import { runQueue } from '../store/queue';
import { getPlayerMatches } from '../store/queries';
import { insertMatch } from '../store/insert';

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

async function processMatch(matchId: string) {
  // Disabled due to Steam GetMatchDetails being broken
  // This would update the match blob with the visibility and update player caches to make them show up under a player
  // Could possibly queue these matches for GC data fetch and then trigger a reconciliation from our own DB (similar to proposed change after parsing a match)
  // const container = generateJob('api_details', {
  //   match_id: Number(matchId),
  // });
  // const body = await getSteamAPIData({ url: container.url });
  // const match = body.result;
  // await insertMatch(match, {
  //   type: 'api',
  //   ifNotExists: true,
  // });
  // await new Promise((resolve) => setTimeout(resolve, 200));
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
  // const heroArray = config.NODE_ENV === 'test' ? ['0'] : Object.keys(constants.heroes);
  const heroId = '0';
  // use steamapi via specific player history and specific hero id (up to 500 games per hero)
  const match_ids: BooleanDict = {};
  // make a request for every possible hero
  const container = generateJob('api_history', {
    account_id: player.account_id,
    hero_id: heroId,
    matches_requested: 100,
  });
  const getApiMatchPage = async (
    player: FullHistoryJob,
    url: string,
  ): Promise<void> => {
    const body = await getSteamAPIData({ url });
    // response for match history for single player
    const resp = body.result.matches;
    let startId = 0;
    resp.forEach((match: any) => {
      // add match ids on each page to match_ids
      const matchId = match.match_id;
      match_ids[matchId] = true;
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
  try {
    // Fetches 1-5 pages of matches for the players and updates the match_ids object
    await getApiMatchPage(player, container.url);
    console.log('%s matches found', Object.keys(match_ids).length);
    player.fh_unavailable = false;
    // check what matches the player is already associated with
    const docs =
      (await getPlayerMatches(player.account_id, {
        project: ['match_id'],
        // Only need to check against recent matches since we get back the most recent 500 or 100 matches from Steam API
        dbLimit: 1000,
      })) ?? [];
    console.log(
      '%s matches found, %s already in db, %s to add',
      Object.keys(match_ids).length,
      docs.length,
      Object.keys(match_ids).length - docs.length,
    );
    // iterate through db results, delete match_id key if this player has this match already
    // will re-request and update matches where this player was previously anonymous
    for (let i = 0; i < docs.length; i += 1) {
      const matchId = docs[i].match_id;
      delete match_ids[matchId];
    }
    if (Object.keys(match_ids).length > 0) {
      redisCount('fullhistory_op');
    }
    // make api_details requests for matches
    const promiseFuncs = Object.keys(match_ids).map(
      (matchId) => () => processMatch(matchId),
    );
    // Number of match details requests to send at once--note this is per worker
    await eachLimitPromise(promiseFuncs, 1);
    await updatePlayer(player);
  } catch (err: any) {
    console.log('error: %s', JSON.stringify(err));
    // check for specific error code if user had a private account
    if (err?.result?.status === 15) {
      console.log('player %s disabled match history', player.account_id);
      player.fh_unavailable = true;
    } else {
      // Generic error (maybe API is down?)
      console.log('player %s generic error', player.account_id);
    }
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
  // async () => redis.zcard('registry:proxy'),
);
