import { Router } from 'express';
import moment from 'moment';
import { parallel } from 'async';
import playerFields from './playerFields.json';
import filterDeps from '../util/filterDeps.js';
import { ADMIN_ACCOUNT_IDS } from '../config.js';
import spec, { paths } from './spec.js';
import { read } from '../store/cacheFunctions.js';
import { raw } from '../store/db.js';
import { zrevrange, zcard } from '../store/redis.js';

const api = new Router();
const { subkeys } = playerFields;

const admins = ADMIN_ACCOUNT_IDS.split(',').map((e) => Number(e));

// Player caches middleware
api.use('/players/:account_id/:info?', (req, res, cb) => {
  // Check cache
  if (!Object.keys(req.query).length && req.params.info) {
    return read(
      {
        key: req.params.info,
        account_id: req.params.account_id,
      },
      (err, result) => {
        if (err) {
          console.error(err);
        }
        if (result) {
          // console.log('[READCACHEHIT] %s', req.originalUrl);
          try {
            return res.json(JSON.parse(result));
          } catch (e) {
            console.error(e);
            return cb();
          }
        }
        // console.log('[READCACHEMISS] %s', req.originalUrl);
        return cb();
      }
    );
  }
  return cb();
});

// Player endpoints middleware
api.use('/players/:account_id/:info?', (req, res, cb) => {
  if (Number.isNaN(Number(req.params.account_id))) {
    return res.status(400).json({ error: 'invalid account id' });
  }
  req.originalQuery = JSON.parse(JSON.stringify(req.query));
  // Enable significance filter by default, disable it if 0 is passed
  if (req.query.significant === '0') {
    delete req.query.significant;
  } else {
    req.query.significant = 1;
  }
  let filterCols = [];
  Object.keys(req.query).forEach((key) => {
    // numberify and arrayify everything in query
    req.query[key] = []
      .concat(req.query[key])
      .map((e) => (Number.isNaN(Number(e)) ? e : Number(e)));
    // build array of required projections due to filters
    filterCols = filterCols.concat(filterDeps[key] || []);
  });
  req.queryObj = {
    project: ['match_id', 'player_slot', 'radiant_win']
      .concat(filterCols)
      .concat((req.query.sort || []).filter((f) => subkeys[f])),
    filter: req.query || {},
    sort: req.query.sort,
    limit: Number(req.query.limit),
    offset: Number(req.query.offset),
    having: Number(req.query.having),
  };
  return cb();
});

api.use('/teams/:team_id/:info?', (req, res, cb) => {
  if (Number.isNaN(Number(req.params.team_id))) {
    return res.status(400).json({ error: 'invalid team id' });
  }
  return cb();
});

api.use('/request/:jobId', (req, res, cb) => {
  if (Number.isNaN(Number(req.params.jobId))) {
    return res.status(400).json({ error: 'invalid job id' });
  }
  return cb();
});

// Admin endpoints middleware
api.use('/admin*', (req, res, cb) => {
  if (req.user && admins.includes(req.user.account_id)) {
    return cb();
  }

  return res.status(403).json({
    error: 'Access Denied',
  });
});

api.get('/admin/apiMetrics', (req, res) => {
  const startTime = moment().startOf('month').format('YYYY-MM-DD');
  const endTime = moment().endOf('month').format('YYYY-MM-DD');

  parallel(
    {
      topAPI: (cb) => {
        raw(
          `
        SELECT
            account_id,
            ARRAY_AGG(DISTINCT api_key) as api_keys,
            SUM(usage) as usage_count
        FROM (
            SELECT
            account_id,
            api_key,
            ip,
            MAX(usage_count) as usage
            FROM api_key_usage
            WHERE
            timestamp >= ?
            AND timestamp <= ?
            GROUP BY account_id, api_key, ip
        ) as t1
        GROUP BY account_id
        ORDER BY usage_count DESC
        LIMIT 10
        `,
          [startTime, endTime]
        ).asCallback((err, res) => cb(err, err ? null : res.rows));
      },
      topAPIIP: (cb) => {
        raw(
          `
        SELECT
            ip,
            ARRAY_AGG(DISTINCT account_id) as account_ids,
            ARRAY_AGG(DISTINCT api_key) as api_keys,
            SUM(usage) as usage_count
        FROM (
            SELECT
            account_id,
            api_key,
            ip,
            MAX(usage_count) as usage
            FROM api_key_usage
            WHERE
            timestamp >= ?
            AND timestamp <= ?
            GROUP BY account_id, api_key, ip
        ) as t1
        GROUP BY ip
        ORDER BY usage_count DESC
        LIMIT 10
        `,
          [startTime, endTime]
        ).asCallback((err, res) => cb(err, err ? null : res.rows));
      },
      numAPIUsers: (cb) => {
        raw(
          `
        SELECT
            COUNT(DISTINCT account_id)
        FROM api_key_usage
        WHERE
            timestamp >= ?
            AND timestamp <= ?
        `,
          [startTime, endTime]
        ).asCallback((err, res) => cb(err, err ? null : res.rows));
      },
      topUsersIP: (cb) => {
        zrevrange('user_usage_count', 0, 24, 'WITHSCORES', cb);
      },
      numUsersIP: (cb) => {
        zcard('user_usage_count', cb);
      },
    },
    (err, result) => {
      if (err) {
        return res.status(500).send(err.message);
      }
      return res.json(result);
    }
  );
});

// API spec
api.get('/', (req, res) => {
  res.json(spec);
});

// API endpoints
Object.keys(paths).forEach((path) => {
  Object.keys(paths[path]).forEach((verb) => {
    const { route, func } = paths[path][verb];
    // Use the 'route' function to get the route path if it's available; otherwise, transform the OpenAPI path to the Express format.
    const routePath = route
      ? route()
      : path.replace(/{/g, ':').replace(/}/g, '');
    // Check if the callback function is defined before adding the route..
    if (typeof func === 'function') {
      api[verb](routePath, func);
    } else {
      // If the function is missing, log a warning message with the problematic route path and verb
      console.warn(
        `Missing callback function for route ${routePath} using ${verb.toUpperCase()}`
      );
    }
  });
});

export default api;
