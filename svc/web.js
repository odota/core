/**
 * Worker serving as main web application
 * Serves web/API requests
 **/
const config = require('../config');
const constants = require('dotaconstants');
const utility = require('../util/utility');
const redis = require('../store/redis');
const status = require('../store/buildStatus');
const db = require('../store/db');
const cassandra = config.ENABLE_CASSANDRA_MATCH_STORE_READ ? require('../store/cassandra') : undefined;
const queries = require('../store/queries');
const search = require('../store/search');
const api = require('../routes/api');
const request = require('request');
const compression = require('compression');
const session = require('cookie-session');
const path = require('path');
const moment = require('moment');
const async = require('async');
const express = require('express');
const app = express();
const passport = require('passport');
const api_key = config.STEAM_API_KEY.split(',')[0];
const SteamStrategy = require('passport-steam').Strategy;
const host = config.ROOT_URL;
const querystring = require('querystring');
const util = require('util');
const rc_public = config.RECAPTCHA_PUBLIC_KEY;
const sessOptions = {
  domain: config.COOKIE_DOMAIN,
  maxAge: 52 * 7 * 24 * 60 * 60 * 1000,
  secret: config.SESSION_SECRET
};
// PASSPORT config
passport.serializeUser((user, done) => {
  done(null, user.account_id);
});
passport.deserializeUser((account_id, done) => {
  done(null, {
    account_id,
  });
});
passport.use(new SteamStrategy({
  returnURL: `${host}/return`,
  realm: host,
  apiKey: api_key,
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
// Dota 2 images middleware (proxy to Dota 2 CDN)
app.use('/apps/dota2/images/:group_name/:image_name', (req, res) => {
  res.header('Cache-Control', 'max-age=604800, public');
  request(`http://cdn.dota2.com/apps/dota2/images/${req.params.group_name}/${req.params.image_name}`).pipe(res);
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
    } else {
      cb();
    }
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
// START service/admin routes
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /matches\nDisallow: /api');
});
app.route('/healthz').get((req, res) => {
  res.send('ok');
});
app.route('/login').get(passport.authenticate('steam', {
  failureRedirect: '/',
}));
app.route('/return').get(passport.authenticate('steam', {
  failureRedirect: '/',
}), (req, res, next) => {
  if (config.UI_HOST) {
    return res.redirect(`${config.UI_HOST}/players/${req.user.account_id}`);
  }
  return res.redirect(`/players/${req.user.account_id}`);
});
app.route('/logout').get((req, res) => {
  req.logout();
  req.session = null;
  if (config.UI_HOST) {
    return res.redirect(config.UI_HOST);
  }
  return res.redirect('/');
});
app.use('/api', api(db, redis, cassandra));
// END service/admin routes
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  return next(err);
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500);
  redis.zadd('error_500', moment().format('X'), req.originalUrl);
  if (req.originalUrl.indexOf('/api') === 0) {
    return res.json({
      error: err,
    });
  } else if (config.NODE_ENV === 'development') {
    // default express handler
    next(err);
  } else {
    return res.render(`error/${err.status === 404 ? '404' : '500'}`, {
      error: err,
    });
  }
});
const port = config.PORT || config.FRONTEND_PORT;
const server = app.listen(port, () => {
  console.log('[WEB] listening on %s', port);
});
// listen for TERM signal .e.g. kill
process.once('SIGTERM', gracefulShutdown);
// listen for INT signal e.g. Ctrl-C
process.once('SIGINT', gracefulShutdown);
// this function is called when you want the server to die gracefully
// i.e. wait for existing connections
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
module.exports = app;
