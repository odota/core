import { Router } from 'express';
import { FilterType, filterDeps } from '../util/filter';
import spec from './spec';
import { readCache } from '../store/cacheFunctions';
import { redisCount } from '../util/utility';
import redis from '../store/redis';
import db from '../store/db';

//@ts-ignore
const api: Router = new Router();
// Player caches middleware
api.use('/players/:account_id/:info?', async (req, res, cb) => {
  // Check cache
  try {
    if (!Object.keys(req.query).length && req.params.info) {
      const result = await readCache({
        key: req.params.info,
        account_id: req.params.account_id,
      });
      if (result) {
        redisCount(redis, 'player_cache_hit');
        return res.json(JSON.parse(result));
      }
      // missed the cache
      return cb();
    }
    // not eligible for cache (query params)
    return cb();
  } catch (e) {
    console.error(e);
    // Exception from cache but we can continue to the regular handler
    return cb();
  }
});
// Player endpoints middleware
api.use('/players/:account_id/:info?', async (req, res, cb) => {
  if (!Number.isInteger(Number(req.params.account_id))) {
    return res.status(400).json({ error: 'invalid account id' });
  }
  (req as unknown as Express.ExtRequest).originalQuery = JSON.parse(
    JSON.stringify(req.query),
  );
  // Enable significance filter by default, disable it if 0 is passed
  if (req.query.significant === '0') {
    delete req.query.significant;
  } else {
    req.query.significant = '1';
  }
  let filterCols: (keyof ParsedPlayerMatch)[] = [];
  Object.keys(req.query).forEach((key) => {
    // numberify and arrayify everything in query
    req.query[key] = []
      .concat(req.query[key] as [])
      .map((e) => (Number.isNaN(Number(e)) ? e : Number(e))) as any;
    // build array of required projections due to filters
    filterCols = filterCols.concat(filterDeps[key as FilterType] || []);
  });
  const sortArr = (req.query.sort || []) as (keyof ParsedPlayerMatch)[];
  const privacy = await db.raw('SELECT fh_unavailable FROM players WHERE account_id = ?', [req.params.account_id]);
  // User can view their own stats
  const isPrivate = Boolean(privacy.rows[0]?.fh_unavailable) && req.user?.account_id !== req.params.account_id;
  (req as unknown as Express.ExtRequest).queryObj = {
    project: [
      'match_id',
      'player_slot',
      'radiant_win',
      ...filterCols,
      ...sortArr,
    ],
    filter: (req.query || {}) as unknown as ArrayifiedFilters,
    sort: sortArr[0],
    limit: Number(req.query.limit),
    offset: Number(req.query.offset),
    having: Number(req.query.having),
    isPrivate,
  };
  return cb();
});
api.use('/teams/:team_id/:info?', (req, res, cb) => {
  if (!Number.isInteger(Number(req.params.team_id))) {
    return res.status(400).json({ error: 'invalid team id' });
  }
  return cb();
});
api.use('/request/:id', (req, res, cb) => {
  // This can be a match ID (POST) or job ID (GET), but same validation
  if (!Number.isInteger(Number(req.params.id)) || Number(req.params.id) <= 0) {
    return res.status(400).json({ error: 'invalid id' });
  }
  return cb();
});
// API spec
api.get('/', (req, res) => {
  res.json(spec);
});
// API endpoints
Object.keys(spec.paths).forEach((path) => {
  Object.keys(spec.paths[path]).forEach((verb) => {
    const { route, func } = spec.paths[path][verb as HttpVerb]!;
    // Use the 'route' function to get the route path if it's available; otherwise, transform the OpenAPI path to the Express format.
    const routePath = route
      ? route()
      : path.replace(/{/g, ':').replace(/}/g, '');
    // Check if the callback function is defined before adding the route..
    if (typeof func === 'function') {
      api[verb as HttpVerb](routePath, async (req, res, cb) => {
        // Wrap all the route handlers in try/catch so we don't have to do it individually
        try {
          await func(req as Express.ExtRequest, res, cb);
        } catch (e) {
          cb(e);
        }
      });
    } else {
      // If the function is missing, log a warning message with the problematic route path and verb
      console.warn(
        `Missing callback function for route ${routePath} using ${verb.toUpperCase()}`,
      );
    }
  });
});
export default api;
