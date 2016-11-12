/**
 * Worker serving as main web application
 * Serves web/API requests
 **/
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
    accountId,
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
app.use('/apps/dota2/images/:group_name/:image_name', (req, res) => {
  res.header('Cache-Control', 'max-age=604800, public');
  request(`http://cdn.dota2.com/apps/dota2/images/${req.params.group_name}/${req.params.image_name}`).pipe(res);
});
// Cosmetics images middleware
// Doesn't use named parameters since the number can be variable, e.g. omniknight/helmet or wards/ocula/observer
app.use('/apps/570/icons/econ/items/:path1/:path2/:path3?', (req, res) => {
  res.header('Cache-Control', 'max-age=604800, public');
  const suffix = [req.params.path1, req.params.path2, req.params.path3].filter(Boolean).join('/');
  request(`http://cdn.dota2.com/apps/570/icons/econ/items/${suffix}`).pipe(res);
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
      return cb(err);
    }
    if (config.NODE_ENV === 'development') {
      console.log(resp);
    }
    if (resp[0] > 90 && config.NODE_ENV !== 'test') {
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
  if (req.originalUrl.indexOf('/api') === 0) {
    redis.zadd('api_hits', moment().format('X'), req.originalUrl);
  }
  if (req.user) {
    redis.zadd('visitors', moment().format('X'), req.user.account_id);
    redis.zadd('tracked', moment().add(config.UNTRACK_DAYS, 'days').format('X'), req.user.account_id);
  }
  res.once('finish', () => {
    const timeEnd = new Date();
    const elapsed = timeEnd - timeStart;
    if (elapsed > 1000 || config.NODE_ENV === 'development') {
      console.log('[SLOWLOG] %s, %s', req.originalUrl, elapsed);
    }
    redis.lpush('load_times', elapsed);
    redis.ltrim('load_times', 0, 9999);
  });
  cb();
});
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
app.use('/api', api());
// 404 route
app.use((req, res) =>
  res.status(404).json({
    error: 'Not Found',
  })
);
// 500 route
app.use((err, req, res, cb) => {
  redis.zadd('error_500', moment().format('X'), req.originalUrl);
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
 **/
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
