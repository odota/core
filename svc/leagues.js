const async = require('async');
const utility = require('../util/utility');
const db = require('../store/db');
const queries = require('../store/queries');

const {
  invokeInterval,
  generateJob,
  getData,
} = utility;

function doLeagues(cb) {
  const container = generateJob('api_leagues', {});
  getData(container.url, (err, apiLeagues) => {
    if (err) {
      return cb(err);
    }

    return async.each(apiLeagues.infos, (league, cb) => {
      const openQualifierTier = league.name.indexOf('Open Qualifier') === -1 ? null : 'excluded';
      league.tier = openQualifierTier || (league.tier > 1 ? 'professional' : 'excluded') || null;
      league.ticket = null;
      league.banner = null;
      league.leagueid = league.league_id;
      queries.upsert(db, 'leagues', league, {
        leagueid: league.league_id,
      }, cb);
    }, cb);
  });
}
invokeInterval(doLeagues, 30 * 60 * 1000);
