import { Router } from 'express';
import { filterDeps } from '../util/filter.ts';
import spec from './spec.ts';
import db from '../store/db.ts';
import { alwaysCols } from './playerFields.ts';
import { queryParamToArray, redisCount } from '../util/utility.ts';
import moment from 'moment';
import redis from '../store/redis.ts';

//@ts-expect-error
const api: Router = new Router();
// Player endpoints middleware
api.use('/players/:account_id{/:info}', async (req, res, next) => {
  if (!Number.isInteger(Number(req.params.account_id))) {
    return res.status(400).json({ error: 'invalid account id' });
  }
  // Enable significance filter by default, disable it if 0 is passed
  if (req.query.significant === '0') {
    delete req.query.significant;
  } else {
    req.query.significant = '1';
  }
  let filterCols: (keyof ParsedPlayerMatch)[] = [];
  const filter = new Map<string, (string | number)[]>();
  Object.keys(req.query).forEach((key) => {
    // numberify and arrayify everything in query
    // leave it as a string if not a number
    filter.set(
      key,
      queryParamToArray(req.query[key]).map((e) =>
        Number.isNaN(Number(e)) ? e : Number(e),
      ),
    );
    // build array of required projections due to filters
    filterCols = filterCols.concat(
      filterDeps[key as keyof typeof filterDeps] || [],
    );
  });
  const sortCols = queryParamToArray(
    req.query.sort,
  ) as (keyof ParsedPlayerMatch)[];
  const privacy = await db.raw(
    'SELECT fh_unavailable FROM players WHERE account_id = ?',
    [req.params.account_id],
  );
  // Show data for pro players
  const pro = await db.raw(
    'SELECT account_id FROM notable_players WHERE account_id = ?',
    [req.params.account_id],
  );
  // User can view their own stats
  const isSelf = Number(req.user?.account_id) === Number(req.params.account_id);
  if (isSelf) {
    redisCount('self_profile_view');
  }
  const isPrivate =
    Boolean(privacy.rows[0]?.fh_unavailable) &&
    !isSelf &&
    !Boolean(pro.rows[0]);
  res.locals.queryObj = {
    project: [...alwaysCols, ...filterCols, ...sortCols],
    filter,
    sort: sortCols[0],
    limit: Number(req.query.limit),
    offset: Number(req.query.offset),
    having: Number(req.query.having),
    isPrivate,
  };
  // Keep track of recently visited account IDs for caching
  await redis.zadd(
    'visitedIds',
    moment.utc().format('X'),
    req.params.account_id,
  );
  await redis.zremrangebyrank('visitedIds', '0', '-50001');
  return next();
});
api.use('/teams/:team_id{/:info}', (req, res, next) => {
  if (!Number.isInteger(Number(req.params.team_id))) {
    return res.status(400).json({ error: 'invalid team id' });
  }
  return next();
});
api.use('/request/:id', (req, res, next) => {
  // This can be a match ID (POST) or job ID (GET), but same validation
  if (!Number.isInteger(Number(req.params.id)) || Number(req.params.id) <= 0) {
    return res.status(400).json({ error: 'invalid id' });
  }
  return next();
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
      api[verb as HttpVerb](routePath, async (req, res, next) => {
        // Wrap all the route handlers in try/catch so we don't have to do it individually
        await func(req, res, next);
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
