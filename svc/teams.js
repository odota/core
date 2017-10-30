const async = require('async');
const db = require('../store/db');
const utility = require('../util/utility');

const invokeInterval = utility.invokeInterval;
const queries = require('../store/queries');

function doTeams(cb) {
  db.raw('select distinct team_id from team_match').asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return async.eachSeries(result.rows, (m, cb) => {
      if (!m.team_id) {
        return cb();
      }
      // GetTeamInfo disabled as of october 2017
      /*
      const container = utility.generateJob('api_teams', {
        // 2 is the smallest team id, use as default
        team_id: m.team_id || 2,
      });
      */
      const container = utility.generateJob('api_team_info_by_team_id', {
        start_at_team_id: m.team_id,
      });
      return utility.getData({ url: container.url, raw: true }, (err, body) => {
        if (err) {
          return cb(err);
        }
        const raw = body;
        body = JSON.parse(body);
        if (!body.result || !body.result.teams) {
          return cb();
        }
        const t = body.result.teams[0];
        // The logo value is a 64 bit integer which is too large to represent in JSON
        // so need to read the raw response value
        // JSON.parse will return an incorrect value in the logo field
        const logoRegex = /^"logo":(.*),$/m;
        const match = logoRegex.exec(raw);
        const logoUgc = match[1];
        const ugcJob = utility.generateJob('api_get_ugc_file_details', {
          ugcid: logoUgc,
        });
        return utility.getData({ url: ugcJob.url, noRetry: true }, (err, body) => {
          if (err) {
            // Continue even if we can't get a logo
            console.error(err);
          }
          t.team_id = m.team_id;
          if (body && body.data) {
            t.logo_url = body.data.url;
          }
          return queries.upsert(db, 'teams', t, {
            team_id: m.team_id,
          }, cb);
        });
      });
    }, cb);
  });
}
invokeInterval(doTeams, 60 * 60 * 1000);
