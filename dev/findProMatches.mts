import { insertMatchPromise } from '../store/queries';
import db from '../store/db';
import { generateJob, getDataPromise } from '../util/utility';

// const leagueUrl = generateJob('api_leagues', {}).url;

async function getPage(url, leagueid, cb) {
  const data = await getDataPromise(url);
  console.log(
    leagueid,
    data.result.total_results,
    data.result.results_remaining
  );
  data.result.matches.forEach((match) => {
    console.log(match.match_id);
    const job = generateJob('api_details', {
      match_id: match.match_id,
    });
    const { url } = job;
    const body = await getDataPromise({
      url,
      delay: 200,
    });
    if (body.result) {
      const match = body.result;
      await insertMatchPromise(match, { skipParse: true });
    }
  });
  if (data.result.results_remaining) {
    const url2 = generateJob('api_history', {
      leagueid,
      start_at_match_id:
        data.result.matches[data.result.matches.length - 1].match_id - 1,
    }).url;
    getPage(url2, leagueid, cb);
  }
}

// From DB
db.select('leagueid')
  .from('leagues')
  .where('tier', 'professional')
  .orWhere('tier', 'premium')
  .asCallback((err, data) => {
    if (err) {
      throw err;
    }
    const leagueIds = data.map((l) => l.leagueid);
    leagueIds.forEach((leagueid) => {
      const { url } = generateJob('api_history', {
        leagueid,
      });
      return getPage(url, leagueid, cb);
    });
    process.exit(Number(err));
  });
// From API
/*
const data = await getDataPromise(leagueUrl);
  // console.log(data);
  const leagueIds = data.result.leagues.map(l => l.leagueid);
    // iterate through leagueids and use getmatchhistory to retrieve matches for each
 leagueIds.forEach(leagueid) => {
    const url = generateJob('api_history',
      {
        leagueid,
      }).url;
    return getPage(url, leagueid, cb);
  }, (err) => {
    process.exit(Number(err));
  });
});
*/
