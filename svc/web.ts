/**
 * Provides the OpenDota API and serves web requests
 * Also supports login through Steam
 * */
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
import keys from './api/keyManagement.ts';
import api from './api/api.ts';
import { upsertPlayer } from './util/insert.ts';
import db from './store/db.ts';
import redis from './store/redis.ts';
import config from '../config.ts';
import {
  getEndOfDay,
  getEndOfMonth,
  getStartOfBlockMinutes,
  redisCount,
} from './util/utility.ts';
import stripe from './store/stripe.ts';
import axios from 'axios';
import { buildStatus } from './util/buildStatus.ts';

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
const unlimitedPaths = [
  '/api', // OpenAPI spec
  '/api/metadata', // User metadata
];

// PASSPORT config
passport.serializeUser((user: any, done: ErrorCb) => {
  done(null, user.account_id);
});
passport.deserializeUser((accountId: string | number, done: ErrorCb) => {
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
      await upsertPlayer(db, player, true);
      cb(null, player);
    },
  ),
);

// Do logging when requests finish
const onResFinish = async (
  req: express.Request,
  res: express.Response,
  timeStart: number,
) => {
  const timeEnd = Date.now();
  const elapsed = timeEnd - timeStart;
  if (elapsed > 2000 || config.NODE_ENV === 'development') {
    console.log('[SLOWLOG] %s, %s', req.originalUrl, elapsed);
    redisCount('slow_api_hit');
  }
  if (
    res.statusCode !== 500 &&
    res.statusCode !== 429 &&
    res.statusCode !== 404 &&
    !unlimitedPaths.includes(req.originalUrl.split('?')[0]) &&
    elapsed < 15000
  ) {
    if (res.locals.isAPIRequest) {
      const apiKey = res.locals.usageIdentifier;
      const apiTimestamp = moment.utc().startOf('month');
      const rows = await db.from('api_keys').where({
        api_key: apiKey,
      });
      const [apiRecord] = rows;
      if (apiRecord) {
        await db.raw(
          `
        INSERT INTO api_key_usage
        (account_id, api_key, customer_id, timestamp, ip, usage_count) VALUES
        (?, ?, ?, ?, ?, 1)
        ON CONFLICT ON CONSTRAINT api_key_usage_pkey DO UPDATE SET usage_count = api_key_usage.usage_count + 1
        `,
          [
            apiRecord.account_id,
            apiRecord.api_key,
            apiRecord.customer_id,
            apiTimestamp,
            '',
          ],
        );
      }
    }
  }
  redisCount('api_hits');
  if (req.headers.origin === config.UI_HOST) {
    redisCount('api_hits_ui');
  }
  const normPath = req.route?.path;
  await redis.zincrby('api_paths', 1, req.method + ' ' + normPath);
  await redis.expireat(
    'api_paths',
    moment.utc().startOf('hour').add(1, 'hour').format('X'),
  );
  await redis.zincrby('api_status', 1, res.statusCode);
  await redis.expireat(
    'api_status',
    moment.utc().startOf('hour').add(1, 'hour').format('X'),
  );
  if (req.user && req.user.account_id) {
    await redis.zadd('visitors', moment.utc().format('X'), req.user.account_id);
    await redis.zremrangebyrank('visitors', '0', '-50001');
  }
  await redis.lpush('load_times', elapsed);
  await redis.ltrim('load_times', 0, 9999);
};

// Dummy User ID for testing
if (config.NODE_ENV === 'test') {
  app.use((req, res, next) => {
    if (req.query.loggedin) {
      req.user = {
        account_id: '1',
      };
    }
    next();
  });
}

// Session/Passport middleware
// req.user available after this
app.use(session(sessOptions));
app.use(passport.initialize());
app.use(passport.session());

// req.body available after this
app.use(bodyParser.json());

// This is for passing the IP through if behind load balancer https://expressjs.com/en/guide/behind-proxies.html
app.set('trust proxy', true);

// CORS headers
// All endpoints accessed from UI should be after this
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// Reject request if not GET and Origin header is present and not an approved domain (prevent CSRF)
app.use((req, res, next) => {
  if (
    req.method !== 'GET' &&
    req.header('Origin') &&
    req.header('Origin') !== config.UI_HOST
  ) {
    // Make an exception for replay parse request
    if (req.method === 'POST' && req.originalUrl.startsWith('/api/request/')) {
      return next();
    }
    return res.status(403).json({ error: 'Invalid Origin header' });
  }
  return next();
});

// Health check
app.get('/healthz', (req, res) => {
  res.end('ok');
});

app.get('/ip', (req, res) => {
  // Echo back the client's ip
  res.end(req.ip);
});

app.post('/register/:service/:host', async (req, res, next) => {
  // check secret matches
  if (config.RETRIEVER_SECRET && config.RETRIEVER_SECRET !== req.query.key) {
    return res.status(403).end();
  }
  // zadd the given host and current time
  if (req.params.service && req.params.host) {
    const size = Number(req.query.size);
    const now = Date.now();
    const keys = [];
    if (size) {
      for (let i = 0; i < size; i++) {
        keys.push(now);
        keys.push(req.params.host + '?' + i);
      }
    } else {
      keys.push(now);
      keys.push(req.params.host);
    }
    const result = await redis.zadd(`registry:${req.params.service}`, ...keys);
    return res.send(result.toString());
  }
  return res.end();
});

// Compress everything after this
app.use(compression());

app.get('/retrieverData', async (req, res, next) => {
  // check secret matches
  if (config.RETRIEVER_SECRET && config.RETRIEVER_SECRET !== req.query.key) {
    return res.status(403).end();
  }
  const accountCount = Number(req.query.count) || 5;
  if ((await redis.scard('retrieverDataSet')) < accountCount) {
    // Refill the set if running out of logins
    const resp = await axios.get<string>(config.STEAM_ACCOUNT_DATA, {
      responseType: 'text',
    });
    const accountData = resp.data.split(/\r\n|\r|\n/g);
    // Store in redis set
    for (let i = 0; i < accountData.length; i++) {
      const accountName = accountData[i].split('\t')[0];
      const reqs = Number(await redis.hget('retrieverSteamIDs', accountName));
      const success = Number(
        await redis.hget('retrieverSuccessSteamIDs', accountName),
      );
      const ratio = success / reqs;
      const isLowRatio = reqs > 25 && ratio <= 0;
      // Don't add high usage logons or high fail logons
      if (reqs < 200) {
        await redis.sadd('retrieverDataSet', accountData[i]);
      }
    }
  }
  // Pop random elements
  const pop = await redis.spop('retrieverDataSet', accountCount);
  const logins = pop.map((login) => {
    const accountName = login.split('\t')[0];
    const password = login.split('\t')[1];
    return { accountName, password };
  });
  return res.json(logins);
});

app.get('/status', async (req, res, next) => {
  const status = await buildStatus();
  return res.json(status);
});

app.get(
  '/login',
  passport.authenticate('steam', {
    failureRedirect: '/api',
  }),
);

app.get(
  '/return',
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

app.get('/logout', (req, res) => {
  req.logout(() => {});
  req.session = null;
  if (config.UI_HOST) {
    return res.redirect(config.UI_HOST);
  }
  return res.redirect('/api');
});

app.get('/subscribeSuccess', async (req, res, next) => {
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
  const accountId = Number(req.user.account_id);
  // associate the customer id with the steam account ID (req.user.account_id)
  await db.raw(
    'INSERT INTO subscriber(account_id, customer_id, status) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET account_id = EXCLUDED.account_id, customer_id = EXCLUDED.customer_id, status = EXCLUDED.status',
    [accountId, customer.id, 'active'],
  );
  // Send the user back to the subscribe page
  return res.redirect(`${config.UI_HOST}/subscribe`);
});

app.post('/manageSub', async (req, res, next) => {
  if (!req.user?.account_id) {
    return res.status(400).json({ error: 'no account ID' });
  }
  const result = await db.raw(
    "SELECT customer_id FROM subscriber where account_id = ? AND status = 'active'",
    [Number(req.user.account_id)],
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

// CORS Preflight for API keys
// NB: make sure UI_HOST is set e.g. http://localhost:3000 otherwise CSRF check above will stop preflight from working
app.options('/keys', cors());
app.use('/keys', keys);

// Admin endpoints middleware
app.use('/admin/*splat', (req, res, next) => {
  if (req.user && admins.includes(Number(req.user.account_id))) {
    return next();
  }
  return res.status(403).json({
    error: 'Access Denied',
  });
});
app.get('/admin/retrieverMetrics', async (req, res, next) => {
  const idReqs = await redis.hgetall('retrieverSteamIDs');
  const ipReqs = await redis.hgetall('retrieverIPs');
  const idSuccess = await redis.hgetall('retrieverSuccessSteamIDs');
  const ipSuccess = await redis.hgetall('retrieverSuccessIPs');
  const steamids = Object.keys(idReqs)
    .map((key) => {
      return {
        key,
        reqs: Number(idReqs[key]) || 0,
        success: Number(idSuccess[key]) || 0,
      };
    })
    .sort((a, b) => b.reqs - a.reqs);
  const ips = Object.keys(ipReqs)
    .map((key) => {
      return {
        key,
        reqs: Number(ipReqs[key]) || 0,
        success: Number(ipSuccess[key]) || 0,
      };
    })
    .sort((a, b) => b.reqs - a.reqs);
  const registryKeys = await redis.zrange('registry:retriever', 0, -1);
  const registry = ips.filter((ip) => registryKeys.includes(ip.key));
  const isGce = (e: (typeof steamids)[number]) =>
    e.key.startsWith('35.') || e.key.startsWith('34.');
  return res.json({
    countReqs: ips.map((e) => e.reqs).reduce((a, b) => a + b, 0),
    gceReqs: ips
      .filter((e) => isGce(e))
      .map((e) => e.reqs)
      .reduce((a, b) => a + b, 0),
    nonGceReqs: ips
      .filter((e) => !isGce(e))
      .map((e) => e.reqs)
      .reduce((a, b) => a + b, 0),
    countSuccess: ips.map((e) => e.success).reduce((a, b) => a + b, 0),
    gceSuccess: ips
      .filter((e) => isGce(e))
      .map((e) => e.success)
      .reduce((a, b) => a + b, 0),
    nonGceSuccess: ips
      .filter((e) => !isGce(e))
      .map((e) => e.success)
      .reduce((a, b) => a + b, 0),
    numIps: ips.length,
    gceIps: ips.filter((e) => isGce(e)).length,
    nonGceIps: ips.filter((e) => !isGce(e)).length,
    numSteamIds: steamids.length,
    registry,
    ips,
    steamids,
  });
});
app.get('/admin/apiMetrics', async (req, res, next) => {
  const startTime = moment.utc().startOf('month').format('YYYY-MM-DD');
  const endTime = moment.utc().endOf('month').format('YYYY-MM-DD');
  const [topUsersKey, numUsersKey] = await Promise.all([
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
        COUNT(DISTINCT account_id)
    FROM api_key_usage
    WHERE
        timestamp >= ?
        AND timestamp <= ?
    `,
      [startTime, endTime],
    ),
  ]);
  return res.json({
    topUsersKey: topUsersKey.rows,
    numUsersKey: numUsersKey.rows?.[0]?.count,
  });
});

// Rate limiter and API key middleware
// Everything after this is rate limited
app.use(async (req, res, next) => {
  const timeStart = Date.now();
  res.once('finish', () => onResFinish(req, res, timeStart));
  const apiKey =
    (req.headers.authorization &&
      req.headers.authorization.replace('Bearer ', '')) ||
    (req.query.api_key as string);
  if (
    apiKey &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      apiKey,
    )
  ) {
    return res.status(400).json({ error: 'Invalid API key format' });
  }
  if (config.ENABLE_API_LIMIT && apiKey) {
    const { rows } = await db.raw(
      'select api_key from api_keys where api_key = ? and is_canceled IS NOT TRUE',
      [apiKey],
    );
    res.locals.isAPIRequest = Boolean(rows.length > 0);
  }
  const { ip } = req;
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
  if (
    config.ENABLE_API_LIMIT &&
    !unlimitedPaths.includes(req.originalUrl.split('?')[0])
  ) {
    let rateCost = 1;
    if (req.method === 'POST' && req.route?.path === '/request/:match_id') {
      rateCost = 10;
    }
    const command = redis.multi();
    command
      .hincrby('rate_limit', res.locals.usageIdentifier, rateCost)
      .expireat('rate_limit', getStartOfBlockMinutes(1, 1));
    command
      .hincrby('daily_rate_limit', res.locals.usageIdentifier, rateCost)
      .expireat('daily_rate_limit', getEndOfDay());
    const resp = await command.exec();
    const incrValue = resp?.[0]?.[1];
    const dailyIncrValue = resp?.[2]?.[1];
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
      // console.log(resp);
      console.log(
        '[WEB] %s, minute: %s, day: %s',
        req.originalUrl,
        incrValue,
        dailyIncrValue,
      );
    }
    const remMinute = Number(rateLimit) - Number(incrValue);
    const remDay = Number(config.API_FREE_LIMIT) - Number(dailyIncrValue);
    res.set({
      'X-Rate-Limit-Remaining-Minute': remMinute,
      'X-IP-Address': ip,
    });
    if (!res.locals.isAPIRequest) {
      res.set({
        'X-Rate-Limit-Remaining-Day': remDay,
      });
    }
    if (remMinute < 0) {
      return res.status(429).json({
        error: 'minute rate limit exceeded',
      });
    }
    if (!res.locals.isAPIRequest && remDay < 0) {
      return res.status(429).json({
        error: 'daily api limit exceeded',
      });
    }
  }
  return next();
});

// API data endpoints
app.use('/api', api);

if (config.NODE_ENV === 'test') {
  app.get('/gen429', (req, res) => res.status(429).end());
  app.get('/gen500', (req, res) => res.status(500).end());
}

// 404 route
app.use((req, res) =>
  res.status(404).json({
    error: 'Not Found',
  }),
);

// 500 route
app.use(
  (err: Error, req: express.Request, res: express.Response, next: ErrorCb) => {
    console.log('[ERR]', req.originalUrl, err);
    redisCount('500_error');
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
      // default express handler
      return next(err?.message || JSON.stringify(err));
    }
    return res.status(500).json({
      error: 'Internal Server Error',
    });
  },
);

// Start the server
const port = config.PORT || config.FRONTEND_PORT;
const server = app.listen(port, () => {
  console.log('[WEB] listening on %s', port);
});

// Websocket server for log streaming
const wss = new WebSocketServer({ server });
// wss.on('connection', (socket, request) => {
//   // Parse the query params for channels to sub to
//   // request.url
// });
const logSub = new Redis(config.REDIS_URL);
logSub.subscribe('api', 'parsed', 'gcdata', 'queue');
logSub.on('message', (channel: string, message: string) => {
  // Emit it to all the connected websockets
  // TODO let the user choose channels to sub to via query params?
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
});

process.on('exit', (code) => {
  if (code > 0) {
    redisCount('web_crash');
  }
});
