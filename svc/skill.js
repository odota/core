/**
 * Worker checking the GetMatchHistory endpoint to get skill data for matches
 **/
const constants = require('dotaconstants');
const config = require('../config.js');
const utility = require('../util/utility');
const db = require('../store/db');
const queries = require('../store/queries');
const async = require('async');

const insertMatchSkill = queries.insertMatchSkill;
const results = {};
const added = {};
const apiKeys = config.STEAM_API_KEY.split(',');
const parallelism = Math.min(3, apiKeys.length);
const skills = [1, 2, 3];
const heroes = Object.keys(constants.heroes);
const permute = [];

function getPageData(start, options, cb) {
  const container = utility.generateJob('api_skill', {
    skill: options.skill,
    hero_id: options.hero_id,
    start_at_match_id: start,
  });
  utility.getData({
    url: container.url,
  }, (err, data) => {
    if (err) {
      return cb(err);
    }
    if (!data || !data.result || !data.result.matches) {
      return getPageData(start, options, cb);
    }
    // data is in data.result.matches
    const matches = data.result.matches;
    return async.eachSeries(matches, (m, cb) => {
      insertMatchSkill(db, {
        match_id: m.match_id,
        skill: options.skill,
      }, cb);
    }, (err) => {
      if (err) {
        return cb(err);
      }
      console.log('total results: %s, added: %s', Object.keys(results).length, Object.keys(added).length);
      // repeat until results_remaining===0
      if (data.result.results_remaining === 0) {
        cb(err);
      }
      const nextStart = matches[matches.length - 1].match_id - 1;
      return getPageData(nextStart, options, cb);
    });
  });
}

function scanSkill() {
  async.eachLimit(permute, parallelism, (object, cb) => {
    // use api_skill
    const start = null;
    getPageData(start, object, cb);
  }, (err) => {
    if (err) {
      throw err;
    }
    return scanSkill();
  });
}

for (let i = 0; i < heroes.length; i += 1) {
  for (let j = 0; j < skills.length; j += 1) {
    permute.push({
      skill: skills[j],
      hero_id: heroes[i],
    });
  }
}
// permute = [{skill:1,hero_id:1}];
console.log(permute.length);
scanSkill();
