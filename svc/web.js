/**
 * Worker serving as main web application
 * Serves web/API requests
 * */
const config = require('../config');
const utility = require('../util/utility');
const redis = require('../store/redis');
const db = require('../store/db');
const queries = require('../store/queries');
const api = require('../routes/api');
const request = require('request');
const compression = require('compression');
const session = require('cookie-session');
const moment = require('moment');
const express = require('express');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const cors = require('cors');

const redisCount = utility.redisCount;

const app = express();
const apiKey = config.STEAM_API_KEY.split(',')[0];
const host = config.ROOT_URL;
const sessOptions = {
  domain: config.COOKIE_DOMAIN,
  maxAge: 52 * 7 * 24 * 60 * 60 * 1000,
  secret: config.SESSION_SECRET,
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
  queries.insertPlayer(db, player, (err) => {
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
  res.set('Content-Type', 'image/png');
  request(`http://cloud-3.steamusercontent.com/${req.originalUrl}`).pipe(res);
});
// Session/Passport middleware
app.use(session(sessOptions));
app.use(passport.initialize());
app.use(passport.session());
// Rate limiter middleware
app.use((req, res, cb) => {
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
  ip = ip.replace(/^.*:/, '').split(',')[0];
  const key = `rate_limit:${ip}`;
  console.log('%s visit %s, ip %s', req.user ? req.user.account_id : 'anonymous', req.originalUrl, ip);
  redis.multi().incr(key).expireat(key, utility.getStartOfBlockMinutes(1, 1)).exec((err, resp) => {
    if (err) {
      console.log(err);
      return cb();
    }
    if (config.NODE_ENV === 'development') {
      console.log(resp);
    }
    if (resp[0] > 180 && config.NODE_ENV !== 'test') {
      return res.status(429).json({
        error: 'rate limit exceeded',
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
    if (req.originalUrl.indexOf('/api') === 0) {
      redisCount(redis, 'api_hits');
      if (req.headers.origin === 'https://www.opendota.com') {
        redisCount(redis, 'api_hits_ui');
      }
      redis.zincrby('api_paths', 1, req.path.split('/')[1]);
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
// CORS headers
app.use(cors({
  origin: true,
  credentials: true,
}));
app.route('/healthz').get((req, res) => {
  res.send('ok');
});
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
// 404 route
app.use((req, res) =>
  res.status(404).json({
    error: 'Not Found',
  }));
// 500 route
app.use((err, req, res, cb) => {
  if (config.NODE_ENV === 'development') {
    // default express handler
    return cb(err);
  }
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
