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
import redis from '../store/redis';
import queue from '../store/queue';
import { getPlayerMatches } from '../store/queries';
import { insertMatch } from '../store/insert';
const apiKeys = config.STEAM_API_KEY.split(',');
// number of match details requests to send at once
const parallelism = Math.min(1, apiKeys.length);

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
  console.log('got full match history for %s', player.account_id);
  redisCount(redis, 'fullhistory');
}

async function processMatch(matchId: string) {
  const container = generateJob('api_details', {
    match_id: Number(matchId),
  });
  const body = await getSteamAPIData({url: container.url, proxy: true});
  const match = body.result;
  await insertMatch(match, {
    type: 'api',
  });
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
  // if test or only want last 100 (no paging), set short_history
  // const heroArray = job.short_history || config.NODE_ENV === 'test' ? ['0'] : Object.keys(constants.heroes);
  // As of December 2021 filtering by hero ID doesn't work
  // const heroArray = ['0'];
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
    const body = await getSteamAPIData({url, proxy: true});
    // if !body.result, retry
    if (!body.result) {
      return getApiMatchPage(player, url);
    }
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

    if (rem === 0 || player.short_history) {
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
  } catch (err) {
    // non-retryable error while scanning, user had a private account
    console.log('error: %s', JSON.stringify(err));
    player.fh_unavailable = true;
    await updatePlayer(player);
    console.timeEnd('doFullHistory: ' + player.account_id.toString());
    return;
  }
  console.log('%s matches found', Object.keys(match_ids).length);
  player.fh_unavailable = false;
  // check what matches the player is already associated with
  const docs =
    (await getPlayerMatches(player.account_id, {
      project: ['match_id'],
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
  // make api_details requests for matches
  const promiseFuncs = Object.keys(match_ids).map(
    (matchId) => () => processMatch(matchId),
  );
  await eachLimitPromise(promiseFuncs, parallelism);
  await updatePlayer(player);
  console.timeEnd('doFullHistory: ' + player.account_id.toString());
}
queue.runQueue(
  'fhQueue',
  Number(config.FULLHISTORY_PARALLELISM),
  processFullHistory,
);
