const express = require('express');
const playerFields = require('./playerFields');
const filterDeps = require('../util/filterDeps');
const spec = require('./spec');

const api = new express.Router();
const subkeys = playerFields.subkeys;

api.use((req, res, cb) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Headers', 'origin, content-type, accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  cb();
});
// Player endpoints middleware
api.use('/players/:account_id/:info?', (req, res, cb) => {
  if (isNaN(Number(req.params.account_id))) {
    return cb('invalid account_id');
  }
  if (req.params.info !== 'matches') {
    // We want to show insignificant/unbalanced matches in match view
    // Set default significant to true in all other views
    req.query.significant = [1];
  }
  let filterCols = [];
  Object.keys(req.query).forEach((key) => {
    // numberify and arrayify everything in query
    req.query[key] = [].concat(req.query[key]).map(e =>
      (isNaN(Number(e)) ? e : Number(e))
    );
    // build array of required projections due to filters
    filterCols = filterCols.concat(filterDeps[key] || []);
  });
  req.queryObj = {
    project: ['match_id', 'player_slot', 'radiant_win'].concat(filterCols).concat((req.query.sort || []).filter(f => subkeys[f])),
    filter: req.query || {},
    sort: req.query.sort,
    limit: Number(req.query.limit),
    offset: Number(req.query.offset),
  };
  return cb();
});
api.get('/', (req, res) => {
  res.json(spec);
});
Object.keys(spec.paths).forEach((path) => {
  Object.keys(spec.paths[path]).forEach((verb) => {
    const {
      route,
      func,
    } = spec.paths[path][verb];
    api[verb](route(), func);
  });
});

module.exports = api;
