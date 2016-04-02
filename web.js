var config = require('./config');
var utility = require('./utility');
var request = require('request');
var redis = require('./redis');
var logger = utility.logger;
var compression = require('compression');
var session = require('cookie-session');
//var session = require('express-session');
//var RedisStore = require('connect-redis')(session);
var status = require('./status');
var path = require('path');
var moment = require('moment');
var bodyParser = require('body-parser');
var async = require('async');
var fs = require('fs');
var constants = require('./constants.js');
var express = require('express');
var app = express();
var example_match = JSON.parse(fs.readFileSync('./matches/frontpage.json'));
var passport = require('passport');
var api_key = config.STEAM_API_KEY.split(",")[0];
var db = require('./db');
var SteamStrategy = require('passport-steam').Strategy;
var host = config.ROOT_URL;
var queries = require('./queries');
var buildSets = require('./buildSets');
var matches = require('./routes/matches');
var hyperopia = require('./routes/hyperopia');
var players = require('./routes/players');
var api = require('./routes/api');
var donate = require('./routes/donate');
var mmstats = require('./routes/mmstats');
var requestRouter = require('./routes/request');
var querystring = require('querystring');
var util = require('util');
var queue = require('./queue');
var fhQueue = queue.getQueue('fullhistory');
//PASSPORT config
passport.serializeUser(function(user, done)
{
    done(null, user.account_id);
});
passport.deserializeUser(function(account_id, done)
{
    db.first().from('players').where(
    {
        account_id: account_id
    }).asCallback(function(err, player)
    {
        redis.setex("visit:" + account_id, 60 * 60 * 24 * config.UNTRACK_DAYS, account_id);
        done(err, player);
    });
});
passport.use(new SteamStrategy(
{
    returnURL: host + '/return',
    realm: host,
    apiKey: api_key
}, function initializeUser(identifier, profile, cb)
{
    var player = profile._json;
    player.last_login = new Date();
    queries.insertPlayer(db, player, function(err)
    {
        if (err)
        {
            return cb(err);
        }
        if (player.profileurl)
        {
            var s = player.profileurl.split('/');
            var vanityUrl = s[s.length - 2];
            redis.set("vanity:" + vanityUrl, player.account_id);
        }
        buildSets(db, redis, function(err)
        {
            if (err)
            {
                return cb(err);
            }
            queue.addToQueue(fhQueue, player,
            {}, function(err)
            {
                return cb(err, player);
            });
        });
    });
}));
//APP config
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.moment = moment;
app.locals.constants = constants;
app.locals.tooltips = constants.tooltips;
app.locals.qs = querystring;
app.locals.util = util;
app.locals.config = config;
app.locals.basedir = __dirname + '/views';
app.locals.prettyPrint = utility.prettyPrint;
app.locals.percentToTextClass = utility.percentToTextClass;
app.use(compression());
app.use("/apps/dota2/images/:group_name/:image_name", function(req, res)
{
    res.set('Cache-Control', 'max-age=604800, public');
    request("http://cdn.dota2.com/apps/dota2/images/" + req.params.group_name + "/" + req.params.image_name).pipe(res);
});
app.use("/public", express.static(path.join(__dirname, '/public')));
/*
var sessOptions = {
    store: new RedisStore({
        client: redis,
        ttl: 52 * 7 * 24 * 60 * 60
    }),
    cookie: {
        maxAge: 52 * 7 * 24 * 60 * 60 * 1000
    },
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}
*/
var sessOptions = {
    maxAge: 52 * 7 * 24 * 60 * 60 * 1000,
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
};
app.use(session(sessOptions));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded(
{
    extended: true
}));
app.use(function(req, res, next)
{
    if (req.headers.host.match(/^www/) !== null)
    {
        res.redirect(req.protocol + '://' + req.headers.host.replace(/^www\./, '') + req.url);
    }
    else
    {
        next();
    }
});
app.use(function(req, res, cb)
{
    var timeStart = new Date();
    if (req.path.indexOf('/names') === 0)
    {
        redis.zadd("alias_hits", moment().format('X'), moment().valueOf() + req.path);
    }
    if (req.path.indexOf('/api') === 0)
    {
        redis.zadd("api_hits", moment().format('X'), moment().valueOf() + req.path);
    }
    res.once('finish', function()
    {
        var timeEnd = new Date();
        /*
        var obj = JSON.stringify({
            path: req.path,
            time: timeEnd - timeStart
        };
        */
        redis.lpush("load_times", timeEnd - timeStart);
        redis.ltrim("load_times", 0, 10000);
    });
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    ip = ip.replace(/^.*:/, '').split(',')[0];
    var key = 'rate_limit:' + ip;
    logger.info("%s visit %s, ip %s", req.user ? req.user.account_id : "anonymous", req.path, ip);
    redis.multi().incr(key).expire(key, 1).exec(function(err, resp)
    {
        if (err)
        {
            return cb(err);
        }
        console.log(resp);
        if (resp[0] > 5 && config.NODE_ENV !== "test")
        {
            return res.status(429).json(
            {
                error: "rate limit exceeded"
            });
        }
        else
        {
            cb();
        }
    });
});
app.use(function(req, res, next)
{
    async.parallel(
    {
        banner: function(cb)
        {
            redis.get("banner", cb);
        },
        cheese: function(cb)
        {
            redis.get("cheese_goal", cb);
        }
    }, function(err, results)
    {
        res.locals.user = req.user;
        res.locals.banner_msg = results.banner;
        res.locals.cheese = results.cheese;
        return next(err);
    });
});
var Poet = require('poet');
var poet = new Poet(app,
{
    routes:
    {
        '/post/:post': 'blog/post'
    }
});
poet.init();
poet.addRoute('/blog/:id?', function(req, res)
{
    var max = poet.helpers.getPostCount();
    var id = Number(req.params.id) || max;
    res.render('blog/blog',
    {
        posts: poet.helpers.getPosts(max - id, max - id + 1),
        id: id,
        max: max
    });
});
app.get('/robots.txt', function(req, res)
{
    res.type('text/plain');
    res.send("User-agent: *\nDisallow: /matches\nDisallow: /api");
});
app.route('/').get(function(req, res, next)
{
    if (req.user)
    {
        res.redirect('/players/' + req.user.account_id);
    }
    else
    {
        res.render('home',
        {
            match: example_match,
            truncate: [2, 6], // if tables should be truncated, pass in an array of which players to display
            home: true
        });
    }
});
app.route('/healthz').get(function(req, res)
{
    res.send("ok");
});
app.route('/status').get(function(req, res, next)
{
    status(db, redis, function(err, result)
    {
        if (err)
        {
            return next(err);
        }
        res.render("status",
        {
            result: result
        });
    });
});
app.route('/faq').get(function(req, res)
{
    res.render("faq",
    {
        questions: poet.helpers.postsWithTag("faq").reverse()
    });
});
app.route('/login').get(passport.authenticate('steam',
{
    failureRedirect: '/'
}));
app.route('/return').get(passport.authenticate('steam',
{
    failureRedirect: '/'
}), function(req, res, next)
{
    res.redirect('/players/' + req.user.account_id);
});
app.route('/logout').get(function(req, res)
{
    req.logout();
    req.session = null;
    res.redirect('/');
});
// Kept for legacy reasons
app.route('/privacyterms').get(function(req, res)
{
    res.redirect("/faq");
});
app.use('/matches', matches(db, redis));
app.use('/hyperopia', hyperopia(db));
app.use('/players', players(db, redis));
app.use('/names/:vanityUrl', function(req, res, cb)
{
    redis.get("vanity:" + req.params.vanityUrl, function(err, result)
    {
        if (err || !result)
        {
            return cb(err || "no matching player found");
        }
        res.redirect('/players/' + Number(result));
    });
});
app.use('/distributions', function(req, res, cb)
{
    queries.getDistributions(redis, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        res.render('distributions', result);
    });
});
app.get('/picks/:n?', function(req, res, cb)
{
    var length = Number(req.params.n || 1);
    var limit = 1000;
    queries.getPicks(redis,
    {
        length: length,
        limit: limit
    }, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        res.render('picks',
        {
            total: result.total,
            picks: result.entries,
            n: length,
            limit: limit,
            tabs:
            {
                1: "Monads",
                2: "Dyads",
                3: "Triads",
                /*
                4: "Tetrads",
                5: "Pentads"
                */
            }
        });
    });
});
app.get('/top', function(req, res, cb)
{
    queries.getTop(db, redis, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        res.render('top', result);
    });
});
app.get('/rankings/:hero_id?', function(req, res, cb)
{
    if (!req.params.hero_id)
    {
        res.render('heroes',
        {
            path: '/rankings',
            alpha_heroes: utility.getAlphaHeroes()
        });
    }
    else
    {
        queries.getHeroRankings(db, redis, req.params.hero_id, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.render('rankings', result);
        });
    }
});
app.get('/benchmarks/:hero_id?', function(req, res, cb)
{
    if (!req.params.hero_id)
    {
        return res.render('heroes',
        {
            path: '/benchmarks',
            alpha_heroes: utility.getAlphaHeroes()
        });
    }
    else
    {
        queries.getBenchmarks(db, redis,
        {
            hero_id: req.params.hero_id
        }, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.render('benchmarks', result);
        });
    }
});
app.get('/plusplus', function(req, res, cb)
{
   return res.render('plusplus', {
       match: example_match,
       truncate: [2, 6]
   });
});
app.use('/api', api(db, redis));
app.use('/', donate(db, redis));
app.use('/', mmstats(redis));
app.use('/', requestRouter(db, redis));
app.use(function(req, res, next)
{
    var err = new Error("Not Found");
    err.status = 404;
    return next(err);
});
app.use(function(err, req, res, next)
{
    res.status(err.status || 500);
    console.log(err);
    redis.zadd("error_500", moment().format('X'), req.path);
    if (config.NODE_ENV !== "development")
    {
        return res.render('error/' + (err.status === 404 ? '404' : '500'),
        {
            error: err
        });
    }
    //default express handler
    next(err);
});
var port = config.PORT || config.FRONTEND_PORT;
var server = app.listen(port, function()
{
    console.log('[WEB] listening on %s', port);
});
//require('./socket.js')(server);
// listen for TERM signal .e.g. kill 
process.on('SIGTERM', gracefulShutdown);
// listen for INT signal e.g. Ctrl-C
process.on('SIGINT', gracefulShutdown);
// this function is called when you want the server to die gracefully
// i.e. wait for existing connections
function gracefulShutdown()
{
    console.log("Received kill signal, shutting down gracefully.");
    server.close(function()
    {
        console.log("Closed out remaining connections.");
        process.exit();
    });
    // if after 
    setTimeout(function()
    {
        console.error("Could not close connections in time, forcefully shutting down");
        process.exit();
    }, 30 * 1000);
}
module.exports = app;
