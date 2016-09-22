/**
 * Worker checking the GetMatchHistory endpoint to get skill data for matches
 **/
const constants = require('dotaconstants');
const config = require('../config.js');
const utility = require('../util/utility');
const db = require('../store/db');
const queries = require('../store/queries');
const async = require('async');
// var insertMatch = queries.insertMatch;
const insertMatchSkill = queries.insertMatchSkill;
const results = {};
const added = {};
const api_keys = config.STEAM_API_KEY.split(',');
const parallelism = Math.min(3, api_keys.length);
// TODO use cluster to spawn a separate worker for each skill level for greater throughput?
const skills = [1, 2, 3];
const heroes = Object.keys(constants.heroes);
const permute = [];
for (let i = 0; i < heroes.length; i++)
{
  for (let j = 0; j < skills.length; j++)
    {
    permute.push(
      {
        skill: skills[j],
        hero_id: heroes[i],
      });
  }
}
// permute = [{skill:1,hero_id:1}];
console.log(permute.length);
scanSkill();

function scanSkill()
{
  async.eachLimit(permute, parallelism, (object, cb) => {
        // use api_skill
    const start = null;
    getPageData(start, object, cb);
  }, (err) => {
    if (err)
        {
      throw err;
    }
    return scanSkill();
  });
}

function getPageData(start, options, cb)
{
  const container = utility.generateJob('api_skill',
    {
      skill: options.skill,
      hero_id: options.hero_id,
      start_at_match_id: start,
    });
  utility.getData(
    {
      url: container.url,
    }, (err, data) => {
    if (err)
        {
      return cb(err);
    }
    if (!data || !data.result || !data.result.matches)
        {
      return getPageData(start, options, cb);
    }
        // data is in data.result.matches
    const matches = data.result.matches;
    async.eachSeries(matches, (m, cb) => {
      insertMatchSkill(db,
        {
          match_id: m.match_id,
          skill: options.skill,
        }, cb);
    }, (err) => {
      if (err)
            {
        return cb(err);
      }
      console.log('total results: %s, added: %s', Object.keys(results).length, Object.keys(added).length);
            // repeat until results_remaining===0
      if (data.result.results_remaining === 0)
            {
        cb(err);
      }
      else
            {
        start = matches[matches.length - 1].match_id - 1;
        return getPageData(start, options, cb);
      }
    });
  });
}
