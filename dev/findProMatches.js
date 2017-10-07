const queries = require('../store/queries');
const db = require('../store/db');
const utility = require('../util/utility');
const async = require('async');

const generateJob = utility.generateJob;
const getData = utility.getData;
// const leagueUrl = generateJob('api_leagues', {}).url;

function getPage(url, leagueid, cb) {
  getData(url, (err, data) => {
    if (err) {
      throw err;
    }
    console.log(leagueid, data.result.total_results, data.result.results_remaining);
    async.eachSeries(data.result.matches, (match, cb) => {
      console.log(match.match_id);
      const job = generateJob('api_details', {
        match_id: match.match_id,
      });
      const url = job.url;
      getData({
        url,
        delay: 200,
      }, (err, body) => {
        if (err) {
          throw err;
        }
        if (body.result) {
          const match = body.result;
          queries.insertMatch(match, { skipParse: true }, (err) => {
            if (err) {
              throw err;
            }
            cb(err);
          });
        } else {
          cb();
        }
      });
    }, (err) => {
      if (err) {
        throw err;
      }
      if (data.result.results_remaining) {
        const url2 = generateJob(
          'api_history',
          {
            leagueid,
            start_at_match_id: data.result.matches[data.result.matches.length - 1].match_id - 1,
          },
        ).url;
        getPage(url2, leagueid, cb);
      } else {
        cb(err);
      }
    });
  });
}

// From DB
db
  .select('leagueid')
  .from('leagues')
  .where('tier', 'professional')
  .orWhere('tier', 'premium')
  .asCallback((err, data) => {
    if (err) {
      throw err;
    }
    const leagueIds = data.map(l => l.leagueid);
    async.eachSeries(leagueIds, (leagueid, cb) => {
      const url = generateJob(
        'api_history',
        {
          leagueid,
        },
      ).url;
      return getPage(url, leagueid, cb);
    }, (err) => {
      process.exit(Number(err));
    });
  });
// From API
/*
getData(leagueUrl, (err, data) => {
  if (err) {
    throw err;
  }
  // console.log(data);
  const leagueIds = data.result.leagues.map(l => l.leagueid);
    // iterate through leagueids and use getmatchhistory to retrieve matches for each
  async.eachSeries(leagueIds, (leagueid, cb) => {
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
