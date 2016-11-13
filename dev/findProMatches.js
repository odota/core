const utility = require('../util/utility');
const async = require('async');

const generateJob = utility.generateJob;
const getData = utility.getData;
const leagueUrl = generateJob('api_leagues',
{}).url;
// const total = 0;

function getPage(url, leagueid, cb) {
  getData(url, (err, data) => {
    console.log(leagueid, data.result.total_results, data.result.results_remaining);
    data.result.matches.forEach((match) => {
      if (match.match_id > 2330655963) {
        console.log(match.match_id);
      }
    });
    if (data.result.results_remaining) {
      const url2 = generateJob('api_history',
        {
          leagueid,
          start_at_match_id: data.result.matches[data.result.matches.length - 1].match_id - 1,
        }).url;
      getPage(url2, leagueid, cb);
    } else {
      cb(err);
    }
  });
}

getData(leagueUrl, (err, data) => {
  if (err) {
    process.exit(1);
  }
    // console.log(data);
  const leagueIds = data.result.leagues.map(l =>
     l.leagueid
  );
    // iterate through leagueids and use getmatchhistory to retrieve matches for each
  async.eachSeries(leagueIds, (leagueid, cb) => {
    if (leagueid < 3500) {
      return cb();
    }
    const url = generateJob('api_history',
      {
        leagueid,
      }).url;
    return getPage(url, leagueid, cb);
  }, (err) => {
    process.exit(Number(err));
  });
});
