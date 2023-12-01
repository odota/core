/**
 * Worker serving as main web application
 * Serves web/API requests
 * */
import request from 'request';
import compression from 'compression';
import session from 'cookie-session';
import moment from 'moment';
import express from 'express';
import { serializeUser, deserializeUser, use, initialize, session as _session, authenticate } from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import cors from 'cors';
import { json } from 'body-parser';
import stripeLib from 'stripe';
import keys from '../routes/keyManagement.js';
import api from '../routes/api.js';
import { insertPlayer } from '../store/queries.js';
import db, { raw } from '../store/db.js';
import utility, { getStartOfBlockMinutes, getEndOfMonth } from '../util/utility.js';
import { STRIPE_SECRET, STEAM_API_KEY, ROOT_URL, COOKIE_DOMAIN, SESSION_SECRET, NODE_ENV, ENABLE_API_LIMIT, API_KEY_PER_MIN_LIMIT, NO_API_KEY_PER_MIN_LIMIT, API_FREE_LIMIT, UI_HOST, PORT, FRONTEND_PORT } from '../config.js';
import redis from '../store/redis.js';

const stripe = stripeLib(STRIPE_SECRET);
const { redisCount } = utility;

const app = express();
const apiKey = STEAM_API_KEY.split(',')[0];
const host = ROOT_URL;

const sessOptions = {
  domain: COOKIE_DOMAIN,
  maxAge: 52 * 7 * 24 * 60 * 60 * 1000,
  secret: SESSION_SECRET,
};

const whitelistedPaths = [
  '/api', // Docs
  '/api/metadata', // Login status
  '/login',
  '/logout',
  '/return',
  '/api/admin/apiMetrics', // Admin metrics
  '/keys', // API Key management
];

const pathCosts = {
  '/api/request': 30,
  '/api/explorer': 5,
};

// PASSPORT config
serializeUser((user, done) => {
  done(null, user.account_id);
});
deserializeUser((accountId, done) => {
  done(null, {
    account_id: accountId,
  });
});
use(
  new SteamStrategy(
    {
      providerURL: 'https://steamcommunity.com/openid',
      returnURL: `${host}/return`,
      realm: host,
      apiKey,
    },
    (identifier, profile, cb) => {
      const player = profile._json;
      player.last_login = new Date();
      insertPlayer(db, player, true, (err) => {
        if (err) {
          return cb(err);
        }
        return cb(err, player);
      });
    }
  )
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
    .on('response', (resp) => {
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
app.use(initialize());
app.use(_session());
// Get client IP to use for rate limiting;
// app.use(requestIp.mw());

// Dummy User ID for testing
if (NODE_ENV === 'test') {
  app.use((req, res, cb) => {
    if (req.query.loggedin) {
      req.user = {
        account_id: 1,
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
  if (ENABLE_API_LIMIT && apiKey) {
    redis.sismember('api_keys', apiKey, (err, resp) => {
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

  let rateLimit = '';
  if (res.locals.isAPIRequest) {
    const requestAPIKey =
      (req.headers.authorization &&
        req.headers.authorization.replace('Bearer ', '')) ||
      req.query.api_key;
    res.locals.usageIdentifier = requestAPIKey;
    rateLimit = API_KEY_PER_MIN_LIMIT;
    // console.log('[KEY] %s visit %s, ip %s', requestAPIKey, req.originalUrl, ip);
  } else {
    res.locals.usageIdentifier = ip;
    rateLimit = NO_API_KEY_PER_MIN_LIMIT;
    // console.log('[USER] %s visit %s, ip %s', req.user ? req.user.account_id : 'anonymous', req.originalUrl, ip);
  }
  const multi = redis
    .multi()
    .hincrby('rate_limit', res.locals.usageIdentifier, pathCosts[req.path] || 1)
    .expireat('rate_limit', getStartOfBlockMinutes(1, 1));

  if (!res.locals.isAPIRequest) {
    multi.zscore('user_usage_count', res.locals.usageIdentifier); // not API request so check previous usage.
  }

  multi.exec((err, resp) => {
    if (err) {
      console.log(err);
      return cb(err);
    }

    res.set({
      'X-Rate-Limit-Remaining-Minute': rateLimit - resp[0],
      'X-IP-Address': ip,
    });
    if (!res.locals.isAPIRequest) {
      res.set(
        'X-Rate-Limit-Remaining-Month',
        API_FREE_LIMIT - Number(resp[2])
      );
    }
    if (NODE_ENV === 'development') {
      console.log('rate limit increment', resp);
    }
    if (resp[0] > rateLimit && NODE_ENV !== 'test') {
      return res.status(429).json({
        error: 'rate limit exceeded',
      });
    }
    if (
      ENABLE_API_LIMIT &&
      !whitelistedPaths.includes(req.path) &&
      !res.locals.isAPIRequest &&
      Number(resp[2]) >= API_FREE_LIMIT
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
  const timeStart = new Date();
  res.once('finish', () => {
    const timeEnd = new Date();
    const elapsed = timeEnd - timeStart;
    if (elapsed > 2000 || NODE_ENV === 'development') {
      console.log('[SLOWLOG] %s, %s', req.originalUrl, elapsed);
    }

    // When called from a middleware, the mount point is not included in req.path. See Express docs.
    if (
      res.statusCode !== 500 &&
      res.statusCode !== 429 &&
      !whitelistedPaths.includes(
        req.baseUrl + (req.path === '/' ? '' : req.path)
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
        if (NODE_ENV === 'development') {
          console.log('usage count increment', err, res);
        }
      });
    }

    if (req.originalUrl.indexOf('/api') === 0) {
      redisCount(redis, 'api_hits');
      if (req.headers.origin === 'https://www.opendota.com') {
        redisCount(redis, 'api_hits_ui');
      }
      redis.zincrby('api_paths', 1, req.path.split('/')[1] || '');
      redis.expireat(
        'api_paths',
        moment().startOf('hour').add(1, 'hour').format('X')
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
    req.header('Origin') !== UI_HOST
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
  })
);
app.use(json());
app.route('/login').get(
  authenticate('steam', {
    failureRedirect: '/api',
  })
);
app.route('/return').get(
  authenticate('steam', {
    failureRedirect: '/api',
  }),
  (req, res) => {
    if (UI_HOST) {
      return res.redirect(`${UI_HOST}/players/${req.user.account_id}`);
    }
    return res.redirect('/api');
  }
);
app.route('/logout').get((req, res) => {
  req.logout();
  req.session = null;
  if (UI_HOST) {
    return res.redirect(UI_HOST);
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
  const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
  const customer = await stripe.customers.retrieve(session.customer);
  const accountId = req.user.account_id;
  // associate the customer id with the steam account ID (req.user.account_id)
  await raw(
    'INSERT INTO subscriber(account_id, customer_id, status) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET account_id = EXCLUDED.account_id, customer_id = EXCLUDED.customer_id, status = EXCLUDED.status',
    [accountId, customer.id, 'active']
  );
  // Send the user back to the subscribe page
  return res.redirect(`${UI_HOST}/subscribe`);
});
app.route('/manageSub').post(async (req, res) => {
  if (!req.user?.account_id) {
    return res.status(400).json({ error: 'no account ID' });
  }
  const result = await raw(
    "SELECT customer_id FROM subscriber where account_id = ? AND status = 'active'",

    [req.user.account_id]
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
app.use('/api', api);
// CORS Preflight for API keys
// NB: make sure UI_HOST is set e.g. http://localhost:3000 otherwise CSRF check above will stop preflight from working
app.options('/keys', cors());
app.use('/keys', keys);
// 404 route
app.use((req, res) =>
  res.status(404).json({
    error: 'Not Found',
  })
);
// 500 route
app.use((err, req, res, cb) => {
  console.log('[ERR]', req.originalUrl);
  redisCount(redis, '500_error');
  if (NODE_ENV === 'development' || NODE_ENV === 'test') {
    // default express handler
    return cb(err);
  }
  console.error(err, err.stacktrace);
  return res.status(500).json({
    error: 'Internal Server Error',
  });
});
const port = PORT || FRONTEND_PORT;
const server = app.listen(port, () => {
  console.log('[WEB] listening on %s', port);
});
/**
 * Wait for connections to end, then shut down
 * */
function gracefulShutdown() {
  console.log('Received kill signal, shutting down gracefully.');
  server.close(() => {
    console.log('Closed out remaining connections.');
    process.exit();
  });
  // if after
  setTimeout(() => {
    console.error(
      'Could not close connections in time, forcefully shutting down'
    );
    process.exit();
  }, 10 * 1000);
}
// listen for TERM signal .e.g. kill
process.once('SIGTERM', gracefulShutdown);
// listen for INT signal e.g. Ctrl-C
process.once('SIGINT', gracefulShutdown);
export default app;
