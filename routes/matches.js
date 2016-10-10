const constants = require('dotaconstants');
const buildMatch = require('../store/buildMatch');
const express = require('express');
const matches = express.Router();
const matchPages = {
  index:
  {
    name: 'Overview',
  },
  benchmarks:
  {
    name: 'Benchmarks',
  },
  performances:
  {
    name: 'Performances',
    parsed: true,
  },
  damage:
  {
    name: 'Damage',
    parsed: true,
  },
  purchases:
  {
    name: 'Purchases',
    parsed: true,
  },
  farm:
  {
    name: 'Farm',
    parsed: true,
  },
  combat:
  {
    name: 'Combat',
    parsed: true,
  },
  graphs:
  {
    name: 'Graphs',
    parsed: true,
  },
  vision:
  {
    name: 'Vision',
    parsed: true,
  },
  objectives:
  {
    name: 'Objectives',
    parsed: true,
  },
  teamfights:
  {
    name: 'Teamfights',
    parsed: true,
  },
  actions:
  {
    name: 'Actions',
    parsed: true,
  },
  analysis:
  {
    name: 'Analysis',
    parsed: true,
  },
  cosmetics:
  {
    name: 'Cosmetics',
    parsed: true,
  },
  chat:
  {
    name: 'Chat',
    parsed: true,
  },
};
const compute = require('../util/compute');
const renderMatch = compute.renderMatch;
module.exports = function (db, redis, cassandra)
{
  matches.get('/:match_id/:info?', (req, res, cb) => {
    console.time('match page');
    buildMatch(req.params.match_id,
      {
        db,
        redis,
        cassandra,
      }, (err, match) => {
        if (err)
            {
          return cb(err);
        }
        if (!match)
            {
          return cb();
        }
        console.timeEnd('match page');
        const info = matchPages[req.params.info] ? req.params.info : 'index';
        renderMatch(match);
        res.render(`match/match_${info}`,
          {
            route: info,
            match,
            tabs: matchPages,
            title: `Match ${match.match_id}`,
          });
      });
  });
  return matches;
};
