const constants = require('dotaconstants');
const buildPlayer = require('../store/buildPlayer');
const express = require('express');
const players = express.Router();
const querystring = require('querystring');
// list of fields that are numerical (continuous).  These define the possible categories for histograms, trends, and records
const player_fields = constants.player_fields;
let playerPages = constants.player_pages;
playerPages = {
  index: {
    name: 'Overview',
  },
  matches: {
    name: 'Matches',
  },
  heroes: {
    name: 'Heroes',
  },
  peers: {
    name: 'Peers',
  },
  pros: {
    name: 'Pros',
    'new-feature': true,
  },
  activity: {
    name: 'Activity',
  },
  records: {
    name: 'Records',
  },
  counts: {
    name: 'Counts',
  },
  histograms: {
    name: 'Histograms',
  },
  trends: {
    name: 'Trends',
  },
  wardmap: {
    name: 'Wardmap',
  },
  items: {
    name: 'Items',
  },
  wordcloud: {
    name: 'Wordcloud',
  },
  rating: {
    name: 'MMR',
  },
  rankings: {
    name: 'Rankings',
  },
};
module.exports = function (db, redis, cassandra)
{
  players.get('/:account_id/:info?/:subkey?', (req, res, cb) => {
    console.time(`player ${req.params.account_id}`);
    const info = playerPages[req.params.info] ? req.params.info : 'index';
    const subkey = req.params.subkey || 'kills';
    buildPlayer(
      {
        db,
        redis,
        cassandra,
        account_id: req.params.account_id,
        info,
        subkey,
        query: req.query,
      }, (err, player) => {
      if (err)
            {
        return cb(err);
      }
      if (!player)
            {
        return cb();
      }
      delete req.query.account_id;
      console.timeEnd(`player ${req.params.account_id}`);
      res.render(`player/player_${info}`,
        {
          q: req.query,
          querystring: Object.keys(req.query).length ? `?${querystring.stringify(req.query)}` : '',
          player,
          route: info,
          subkey,
          tabs: playerPages,
          histograms: player_fields.subkeys,
          times: player_fields.times,
          counts: player_fields.countCats,
          title: (player.profile.personaname || player.profile.account_id),
        });
    });
  });
    // return router
  return players;
};
