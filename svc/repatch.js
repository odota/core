/**
 * Periodically recalculate patch ID for matches in match table
 * */
const async = require('async');
const constants = require('dotaconstants');
const db = require('../store/db');
const queries = require('../store/queries');
const utility = require('../util/utility');

const { invokeInterval } = utility;

function rePatch() {
  db.select(['match_id', 'start_time']).from('matches').asCallback((err, matchIds) => {
    if (err) {
      throw err;
    }
    async.eachSeries(matchIds, (match, cb) => {
      queries.upsert(
        db, 'match_patch',
        {
          match_id: match.match_id,
          patch: constants.patch[utility.getPatchIndex(match.start_time)].name,
        },
        {
          match_id: match.match_id,
        }, cb,
      );
    }, (err) => {
      console.error(err);
    });
  });
}
invokeInterval(rePatch, 24 * 60 * 60 * 1000);
