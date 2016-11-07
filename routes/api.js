const express = require('express');
const api = express.Router();
const constants = require('dotaconstants');
const player_fields = constants.player_fields;
const subkeys = player_fields.subkeys;
const filterDeps = require('../util/filterDeps');
const spec = require('./spec');
const multer = require('multer')({
  inMemory: true,
  fileSize: 100 * 1024 * 1024, // no larger than 100mb
});
module.exports = function (db, redis, cassandra) {
  api.use((req, res, cb) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Headers', 'origin, content-type, accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    cb();
  });
  api.use(multer.single('replay_blob'));
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
    for (const key in req.query) {
      // numberify and arrayify everything in query
      req.query[key] = [].concat(req.query[key]).map(e =>
         isNaN(Number(e)) ? e : Number(e)
      );
      // build array of required projections due to filters
      filterCols = filterCols.concat(filterDeps[key] || []);
    }
    req.queryObj = {
      project: ['match_id', 'player_slot', 'radiant_win'].concat(filterCols).concat((req.query.sort || []).filter(f => subkeys[f])),
      filter: req.query || {},
      sort: req.query.sort,
      limit: Number(req.query.limit),
      offset: Number(req.query.offset),
    };
    cb();
  });
  api.get('/', (req, res, cb) => {
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
  return api;
};
