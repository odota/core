import { RequestHandler, Router } from 'express';
import playerFields from './playerFields';
import { filterDeps } from '../util/filterDeps';
import spec from './spec';
import { readCache } from '../store/cacheFunctions';

//@ts-ignore
const api: Router = new Router();
const { subkeys } = playerFields;
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
        // console.log('[READCACHEHIT] %s', req.originalUrl);
        return res.json(JSON.parse(result));
      }
      // console.log('[READCACHEMISS] %s', req.originalUrl);
      return cb();
    }
    // console.log('[READCACHESKIP] %s', req.originalUrl);
    return cb();
  } catch (e) {
    console.error(e);
    // Something weird with the cache but we can continue to the regular handler
    return cb();
  }
});
// Player endpoints middleware
api.use('/players/:account_id/:info?', (req, res, cb) => {
  if (Number.isNaN(Number(req.params.account_id))) {
    return res.status(400).json({ error: 'invalid account id' });
  }
  (req as unknown as Express.ExtRequest).originalQuery = JSON.parse(JSON.stringify(req.query));
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
    filterCols = filterCols.concat(filterDeps[key] || []);
  });
  (req as unknown as Express.ExtRequest).queryObj = {
    project: ['match_id', 'player_slot', 'radiant_win']
      .concat(filterCols)
      .concat(
        ((req.query.sort as []) || []).filter(
          (f: keyof ParsedPlayerMatch) => subkeys[f]
        )
      ) as (keyof ParsedPlayerMatch)[],
    filter: (req.query || {}) as unknown as ArrayifiedFilters,
    sort: req.query.sort as keyof ParsedPlayerMatch,
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
      api[verb as HttpVerb](routePath, func as RequestHandler);
    } else {
      // If the function is missing, log a warning message with the problematic route path and verb
      console.warn(
        `Missing callback function for route ${routePath} using ${verb.toUpperCase()}`
      );
    }
  });
});
export default api;
