const { insertMatch } = await import('../svc/util/insert.js');
const { db } = await import('../svc/store/db.js');
const { getSteamAPIData, SteamAPIUrls } = await import('../svc/util/utility.js');

async function getPage(url: string, leagueid: number) {
  const data: any = await getSteamAPIData({ url });
  console.log(
    leagueid,
    data.result.total_results,
    data.result.results_remaining,
  );
  for (let i = 0; i < data.result.matches.length; i++) {
    const match = data.results.matches[i];
    console.log(match.match_id);
    const url = SteamAPIUrls.api_details({
      match_id: match.match_id,
    });
    const body: any = await getSteamAPIData({
      url,
    });
    if (body.result) {
      const match = body.result;
      await insertMatch(match, { type: 'api' });
    }
  }
  if (data.result.results_remaining) {
    const url2 = SteamAPIUrls.api_history({
      leagueid,
      start_at_match_id:
        data.result.matches[data.result.matches.length - 1].match_id - 1,
    });
    return getPage(url2, leagueid);
  }
}

// From DB
const data: any = await db
  .select('leagueid')
  .from('leagues')
  .where('tier', 'professional')
  .orWhere('tier', 'premium');
const leagueIds = data.map((l: any) => l.leagueid);
// NOTE: there could be a lot of leagueids
leagueIds.forEach(async (leagueid: number) => {
  const url = SteamAPIUrls.api_history({
    leagueid,
  });
  return getPage(url, leagueid);
});
process.exit(0);
// From API
/*
const data = await getDataPromise(leagueUrl);
  // console.log(data);
  const leagueIds = data.result.leagues.map(l => l.leagueid);
    // iterate through leagueids and use getmatchhistory to retrieve matches for each
 leagueIds.forEach(leagueid) => {
    const url = SteamAPIUrls.api_history({
        leagueid,
      });
    return getPage(url, leagueid, cb);
  }, (err) => {
    process.exit(Number(err));
  });
});
*/
