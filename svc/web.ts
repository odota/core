/**
 * Provides the OpenDota API and serves web requests
 * Also supports login through Steam
 * */
import request from 'request';
import compression from 'compression';
import session from 'cookie-session';
import moment from 'moment';
import express from 'express';
import passport from 'passport';
import passportSteam from 'passport-steam';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Redis } from 'ioredis';
import { WebSocketServer, WebSocket } from 'ws';
import keys from '../routes/keyManagement';
import api from '../routes/api';
import { upsertPlayer } from '../store/insert';
import db from '../store/db';
import redis from '../store/redis';
import config from '../config';
import {
  getEndOfMonth,
  getStartOfBlockMinutes,
  redisCount,
} from '../util/utility';
import stripe from '../store/stripe';

const admins = config.ADMIN_ACCOUNT_IDS.split(',').map((e) => Number(e));
const SteamStrategy = passportSteam.Strategy;
export const app = express();
const apiKey = config.STEAM_API_KEY.split(',')[0];
const host = config.ROOT_URL;
const sessOptions = {
  domain: config.COOKIE_DOMAIN,
  maxAge: 52 * 7 * 24 * 60 * 60 * 1000,
  secret: config.SESSION_SECRET,
};
const whitelistedPaths = [
  '/api',
  '/api/metadata',
  '/api/status',
  '/login',
  '/logout',
  '/return',
  '/api/admin/apiMetrics',
  '/keys', // API Key management
];
const pathCosts: NumberDict = {
  '/api/request': 30,
  '/api/explorer': 5,
};
// PASSPORT config
passport.serializeUser((user: any, done: ErrorCb) => {
  done(null, user.account_id);
});
passport.deserializeUser((accountId: string, done: ErrorCb) => {
  done(null, {
    account_id: accountId,
  });
});
passport.use(
  new SteamStrategy(
    {
      providerURL: 'https://steamcommunity.com/openid',
      returnURL: `${host}/return`,
      realm: host,
      apiKey,
    },
    async (identifier: string, profile: any, cb: ErrorCb) => {
      const player = profile._json;
      player.last_login = new Date();
      try {
        await upsertPlayer(db, player, true);
        cb(null, player);
      } catch (e) {
        cb(e);
      }
    },
  ),
);
// Compression middleware
app.use(compression());
// Dota 2 images middleware (proxy to Dota 2 CDN to serve over https)
app.use('/apps', (req, res) => {
  request(`http://cdn.dota2.com/${req.originalUrl}`).pipe(res);
});
// Proxy to serve team logos over https
app.use('/ugc', (req, res) => {
  request(`http://cloud-3.steamusercontent.com/${req.originalUrl}`)
    .on('response', (resp: any) => {
      resp.headers['content-type'] = 'image/png';
    })
    .pipe(res);
});
// Health check
app.route('/healthz').get((req, res) => {
  res.send('ok');
});
// Session/Passport middleware
app.use(session(sessOptions));
app.use(passport.initialize());
app.use(passport.session());
// Get client IP to use for rate limiting;
// app.use(requestIp.mw());
// Dummy User ID for testing
if (config.NODE_ENV === 'test') {
  app.use((req, res, cb) => {
    if (req.query.loggedin) {
      req.user = {
        account_id: '1',
      };
    }
    cb();
  });
  app.route('/gen429').get((req, res) => res.status(429).end());
  app.route('/gen500').get((req, res) => res.status(500).end());
}
// Rate limiter and API key middleware
app.use((req, res, cb) => {
  // console.log('[REQ]', req.originalUrl);
  const apiKey =
    (req.headers.authorization &&
      req.headers.authorization.replace('Bearer ', '')) ||
    req.query.api_key;
  if (config.ENABLE_API_LIMIT && apiKey) {
    redis.sismember('api_keys', apiKey as string, (err, resp) => {
      if (err) {
        cb(err);
      } else {
        res.locals.isAPIRequest = resp === 1;
        cb();
      }
    });
  } else {
    cb();
  }
});
app.set('trust proxy', true);
app.use((req, res, cb) => {
  const { ip } = req;
  res.locals.ip = ip;
  let rateLimit: number | string = '';
  if (res.locals.isAPIRequest) {
    const requestAPIKey =
      (req.headers.authorization &&
        req.headers.authorization.replace('Bearer ', '')) ||
      req.query.api_key;
    res.locals.usageIdentifier = requestAPIKey;
    rateLimit = config.API_KEY_PER_MIN_LIMIT;
    // console.log('[KEY] %s visit %s, ip %s', requestAPIKey, req.originalUrl, ip);
  } else {
    res.locals.usageIdentifier = ip;
    rateLimit = config.NO_API_KEY_PER_MIN_LIMIT;
    // console.log('[USER] %s visit %s, ip %s', req.user ? req.user.account_id : 'anonymous', req.originalUrl, ip);
  }
  const command = redis.multi();
  command
    .hincrby('rate_limit', res.locals.usageIdentifier, pathCosts[req.path] || 1)
    .expireat('rate_limit', getStartOfBlockMinutes(1, 1));
  if (!res.locals.isAPIRequest) {
    // not API request so check previous usage
    command.zscore('user_usage_count', res.locals.usageIdentifier);
  }
  command.exec((err, resp) => {
    if (err) {
      console.log(err);
      return cb(err);
    }
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
      console.log('[WEB] %s rate limit %s', req.originalUrl, resp);
    }
    const incrValue = resp![0]?.[1];
    const prevUsage = resp![2]?.[1];
    res.set({
      'X-Rate-Limit-Remaining-Minute': Number(rateLimit) - Number(incrValue),
      'X-IP-Address': ip,
    });
    if (!res.locals.isAPIRequest) {
      res.set(
        'X-Rate-Limit-Remaining-Month',
        (Number(config.API_FREE_LIMIT) - Number(prevUsage)).toString(),
      );
    }
    if (Number(incrValue) > Number(rateLimit) && config.NODE_ENV !== 'test') {
      return res.status(429).json({
        error: 'rate limit exceeded',
      });
    }
    if (
      config.ENABLE_API_LIMIT &&
      !whitelistedPaths.includes(req.path) &&
      !res.locals.isAPIRequest &&
      Number(prevUsage) >= Number(config.API_FREE_LIMIT)
    ) {
      return res.status(429).json({
        error: 'monthly api limit exceeded',
      });
    }
    return cb();
  });
});
// Telemetry middleware
app.use((req, res, cb) => {
  const timeStart = Number(new Date());
  res.once('finish', () => {
    const timeEnd = Number(new Date());
    const elapsed = timeEnd - timeStart;
    if (elapsed > 2000 || config.NODE_ENV === 'development') {
      console.log('[SLOWLOG] %s, %s', req.originalUrl, elapsed);
    }
    // When called from a middleware, the mount point is not included in req.path. See Express docs.
    if (
      res.statusCode !== 500 &&
      res.statusCode !== 429 &&
      !whitelistedPaths.includes(
        req.baseUrl + (req.path === '/' ? '' : req.path),
      ) &&
      elapsed < 10000
    ) {
      const multi = redis.multi();
      if (res.locals.isAPIRequest) {
        multi
          .hincrby('usage_count', res.locals.usageIdentifier, 1)
          .expireat('usage_count', getEndOfMonth());
      } else {
        multi
          .zincrby('user_usage_count', 1, res.locals.usageIdentifier)
          .expireat('user_usage_count', getEndOfMonth());
      }
      multi.exec((err, res) => {
        if (config.NODE_ENV === 'development') {
          console.log('usage count increment', err, res);
        }
      });
    }
    if (req.originalUrl.indexOf('/api') === 0) {
      redisCount(redis, 'api_hits');
      if (req.headers.origin === config.UI_HOST) {
        redisCount(redis, 'api_hits_ui');
      }
      const normPath = req.path
        .replace(/\d+/g, ':id')
        .toLowerCase()
        .replace(/\/+$/, '');
      redis.zincrby('api_paths', 1, req.method + ' ' + normPath);
      redis.expireat(
        'api_paths',
        moment().startOf('hour').add(1, 'hour').format('X'),
      );
    }
    if (req.user && req.user.account_id) {
      redis.zadd('visitors', moment().format('X'), req.user.account_id);
    }
    redis.lpush('load_times', elapsed);
    redis.ltrim('load_times', 0, 9999);
  });
  cb();
});
app.use((req, res, next) => {
  // Reject request if not GET and Origin header is present and not an approved domain (prevent CSRF)
  if (
    req.method !== 'GET' &&
    req.header('Origin') &&
    req.header('Origin') !== config.UI_HOST
  ) {
    // Make an exception for replay parse request
    if (req.method === 'POST' && req.path.startsWith('/api/request/')) {
      return next();
    }
    return res.status(403).json({ error: 'Invalid Origin header' });
  }
  return next();
});
// CORS headers
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(bodyParser.json());
app.route('/login').get(
  passport.authenticate('steam', {
    failureRedirect: '/api',
  }),
);
app.route('/return').get(
  passport.authenticate('steam', {
    failureRedirect: '/api',
  }),
  (req, res) => {
    if (config.UI_HOST) {
      return res.redirect(
        req.user
          ? `${config.UI_HOST}/players/${req.user.account_id}`
          : config.UI_HOST,
      );
    }
    return res.redirect('/api');
  },
);
app.route('/logout').get((req, res) => {
  req.logout(() => {});
  req.session = null;
  if (config.UI_HOST) {
    return res.redirect(config.UI_HOST);
  }
  return res.redirect('/api');
});
app.route('/subscribeSuccess').get(async (req, res) => {
  if (!req.query.session_id) {
    return res.status(400).json({ error: 'no session ID' });
  }
  if (!req.user?.account_id) {
    return res.status(400).json({ error: 'no account ID' });
  }
  // look up the checkout session id: https://stripe.com/docs/payments/checkout/custom-success-page
  const session = await stripe.checkout.sessions.retrieve(
    req.query.session_id as string,
  );
  const customer = await stripe.customers.retrieve(session.customer as string);
  const accountId = req.user.account_id;
  // associate the customer id with the steam account ID (req.user.account_id)
  await db.raw(
    'INSERT INTO subscriber(account_id, customer_id, status) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET account_id = EXCLUDED.account_id, customer_id = EXCLUDED.customer_id, status = EXCLUDED.status',
    [accountId, customer.id, 'active'],
  );
  // Send the user back to the subscribe page
  return res.redirect(`${config.UI_HOST}/subscribe`);
});
app.route('/manageSub').post(async (req, res) => {
  if (!req.user?.account_id) {
    return res.status(400).json({ error: 'no account ID' });
  }
  const result = await db.raw(
    "SELECT customer_id FROM subscriber where account_id = ? AND status = 'active'",
    [req.user.account_id],
  );
  const customer = result?.rows?.[0];
  if (!customer) {
    return res.status(400).json({ error: 'customer not found' });
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.customer_id,
    return_url: req.body?.return_url,
  });
  return res.json(session);
});
// Admin endpoints middleware
api.use('/admin*', (req, res, cb) => {
  if (req.user && admins.includes(Number(req.user.account_id))) {
    return cb();
  }
  return res.status(403).json({
    error: 'Access Denied',
  });
});
api.get('/admin/apiMetrics', async (req, res, cb) => {
  try {
    const startTime = moment().startOf('month').format('YYYY-MM-DD');
    const endTime = moment().endOf('month').format('YYYY-MM-DD');
    const [topAPI, topAPIIP, numAPIUsers, topUsersIP, numUsersIP] =
      await Promise.all([
        db.raw(
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
          [startTime, endTime],
        ),
        db.raw(
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
          [startTime, endTime],
        ),
        db.raw(
          `
    SELECT
        COUNT(DISTINCT account_id)
    FROM api_key_usage
    WHERE
        timestamp >= ?
        AND timestamp <= ?
    `,
          [startTime, endTime],
        ),
        redis.zrevrange('user_usage_count', 0, 24, 'WITHSCORES'),
        redis.zcard('user_usage_count'),
      ]);
    return res.json({
      topAPI: topAPI.rows,
      topAPIIP: topAPIIP.rows,
      numAPIUsers: numAPIUsers.rows,
      topUsersIP,
      numUsersIP,
    });
  } catch (e) {
    return cb(e);
  }
});
app.use('/api', api);
// CORS Preflight for API keys
// NB: make sure UI_HOST is set e.g. http://localhost:3000 otherwise CSRF check above will stop preflight from working
app.options('/keys', cors());
app.use('/keys', keys);
// 404 route
app.use((req, res) =>
  res.status(404).json({
    error: 'Not Found',
  }),
);
// 500 route
app.use(
  (err: Error, req: express.Request, res: express.Response, cb: ErrorCb) => {
    console.log('[ERR]', req.originalUrl, err);
    redisCount(redis, '500_error');
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
      // default express handler
      return cb(err?.message || JSON.stringify(err));
    }
    return res.status(500).json({
      error: 'Internal Server Error',
    });
  },
);
const port = config.PORT || config.FRONTEND_PORT;
const server = app.listen(port, () => {
  console.log('[WEB] listening on %s', port);
});
const wss = new WebSocketServer({ server });
const logSub = new Redis(config.REDIS_URL);
logSub.subscribe('api', 'parsed', 'gcdata');
logSub.on('message', (channel: string, message: string) => {
  // Emit it to all the connected websockets
  // Can we let the user choose channels to sub to?
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
});
// count any uncaught exceptions crashing the process
process.on('uncaughtException', function (err) {
  redisCount(redis, 'web_crash');
  console.error(err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, p) => {
  // In production pm2 doesn't appear to auto restart unless we exit the process here
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  process.exit(1);
});
