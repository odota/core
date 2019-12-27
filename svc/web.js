/**
 * Worker serving as main web application
 * Serves web/API requests
 * */
const request = require('request');
const compression = require('compression');
const session = require('cookie-session');
const moment = require('moment');
const express = require('express');
const requestIp = require('request-ip');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const cors = require('cors');
const keys = require('../routes/keyManagement');
const webhooks = require('../routes/webhookManagement');
const api = require('../routes/api');
const queries = require('../store/queries');
const db = require('../store/db');
const redis = require('../store/redis');
const utility = require('../util/utility');
const config = require('../config');

const { redisCount } = utility;

const app = express();
const apiKey = config.STEAM_API_KEY.split(',')[0];
const host = config.ROOT_URL;

const sessOptions = {
  domain: config.COOKIE_DOMAIN,
  maxAge: 52 * 7 * 24 * 60 * 60 * 1000,
  secret: config.SESSION_SECRET,
};

const whitelistedPaths = [
  '/api', // Docs
  '/api/metadata', // Login status
  '/login',
  '/logout',
  '/api/admin/apiMetrics', // Admin metrics
  '/keys', // API Key management
  '/webhooks', // Webhook management
];

const pathCosts = {
  '/api/request': 30,
  '/api/explorer': 5,
};

// PASSPORT config
passport.serializeUser((user, done) => {
  done(null, user.account_id);
});
passport.deserializeUser((accountId, done) => {
  done(null, {
    account_id: accountId,
  });
});
passport.use(new SteamStrategy({
  returnURL: `${host}/return`,
  realm: host,
  apiKey,
}, (identifier, profile, cb) => {
  const player = profile._json;
  player.last_login = new Date();
  queries.insertPlayer(db, player, true, (err) => {
    if (err) {
      return cb(err);
    }
    return cb(err, player);
  });
}));
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
app.use(passport.initialize());
app.use(passport.session());
// Get client IP to use for rate limiting;
app.use(requestIp.mw());

// Dummy User ID for testing
if (config.NODE_ENV === 'test') {
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
  if (config.ENABLE_API_LIMIT && req.query.api_key) {
    redis.sismember('api_keys', req.query.api_key, (err, resp) => {
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
app.use((req, res, cb) => {
  const ip = req.clientIp;
  res.locals.ip = ip;

  let rateLimit = '';
  if (res.locals.isAPIRequest) {
    const requestAPIKey = req.query.api_key;
    res.locals.usageIdentifier = `API:${ip}:${requestAPIKey}`;
    rateLimit = config.API_KEY_PER_MIN_LIMIT;
    console.log('[KEY] %s visit %s, ip %s', requestAPIKey, req.originalUrl, ip);
  } else {
    res.locals.usageIdentifier = ip;
    rateLimit = config.NO_API_KEY_PER_MIN_LIMIT;
    console.log('[USER] %s visit %s, ip %s', req.user ? req.user.account_id : 'anonymous', req.originalUrl, ip);
  }
  const multi = redis.multi()
    .hincrby('rate_limit', res.locals.usageIdentifier, pathCosts[req.path] || 1)
    .expireat('rate_limit', utility.getStartOfBlockMinutes(1, 1));

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
      res.set('X-Rate-Limit-Remaining-Month', config.API_FREE_LIMIT - Number(resp[2]));
    }
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
      console.log('rate limit increment', resp);
    }
    if (resp[0] > rateLimit && config.NODE_ENV !== 'test') {
      return res.status(429).json({
        error: 'rate limit exceeded',
      });
    }
    if (config.ENABLE_API_LIMIT && !whitelistedPaths.includes(req.path) && !res.locals.isAPIRequest && Number(resp[2]) >= config.API_FREE_LIMIT) {
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
    if (elapsed > 1000 || config.NODE_ENV === 'development') {
      console.log('[SLOWLOG] %s, %s', req.originalUrl, elapsed);
    }

    // When called from a middleware, the mount point is not included in req.path. See Express docs.
    if (res.statusCode !== 500
        && res.statusCode !== 429
        && !whitelistedPaths.includes(req.baseUrl + (req.path === '/' ? '' : req.path))
        && elapsed < 10000) {
      const multi = redis.multi();
      if (res.locals.isAPIRequest) {
        multi.hincrby('usage_count', res.locals.usageIdentifier, 1)
          .expireat('usage_count', utility.getEndOfMonth());
      } else {
        multi.zincrby('user_usage_count', 1, res.locals.usageIdentifier)
          .expireat('user_usage_count', utility.getEndOfMonth());
      }

      multi.exec((err, res) => {
        if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
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
      redis.expireat('api_paths', moment().startOf('hour').add(1, 'hour').format('X'));
    }
    if (req.user && req.user.account_id) {
      redis.zadd('visitors', moment().format('X'), req.user.account_id);
    }
    if (req.user && req.user.account_id) {
      redis.zadd('tracked', moment().add(config.UNTRACK_DAYS, 'days').format('X'), req.user.account_id);
    }
    redis.lpush('load_times', elapsed);
    redis.ltrim('load_times', 0, 9999);
  });
  cb();
});
app.use((req, res, next) => {
  // Reject request if not GET and Origin header is present and not an approved domain (prevent CSRF)
  if (req.method !== 'GET' && req.header('Origin') && req.header('Origin') !== config.UI_HOST) {
    return res.status(403).json({ error: 'Invalid Origin header' });
  }
  return next();
});
// CORS headers
app.use(cors({
  origin: true,
  credentials: true,
}));
app.route('/login').get(passport.authenticate('steam', {
  failureRedirect: '/api',
}));
app.route('/return').get(passport.authenticate('steam', {
  failureRedirect: '/api',
}), (req, res) => {
  if (config.UI_HOST) {
    return res.redirect(`${config.UI_HOST}/players/${req.user.account_id}`);
  }
  return res.redirect('/api');
});
app.route('/logout').get((req, res) => {
  req.logout();
  req.session = null;
  if (config.UI_HOST) {
    return res.redirect(config.UI_HOST);
  }
  return res.redirect('/api');
});
app.use('/api', api);
app.use('/webhooks', webhooks);
// CORS Preflight for API keys
app.options('/keys', cors());
app.use('/keys', keys);
// 404 route
app.use((req, res) => res.status(404).json({
  error: 'Not Found',
}));
// 500 route
app.use((err, req, res, cb) => {
  if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
    // default express handler
    return cb(err);
  }
  console.error(err && err.stacktrace);
  return res.status(500).json({
    error: 'Internal Server Error',
  });
});
const port = config.PORT || config.FRONTEND_PORT;
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
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit();
  }, 10 * 1000);
}
// listen for TERM signal .e.g. kill
process.once('SIGTERM', gracefulShutdown);
// listen for INT signal e.g. Ctrl-C
process.once('SIGINT', gracefulShutdown);
module.exports = app;
