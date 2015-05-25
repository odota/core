var config = require('./config');
var rc_public = config.RECAPTCHA_PUBLIC_KEY;
var utility = require('./utility');
var r = require('./redis');
var redis = r.client;
var kue = r.kue;
var db = require('./db');
var logger = utility.logger;
var compression = require('compression');
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var passport = require('./passport');
var status = require('./status');
var auth = require('http-auth');
var path = require('path');
var moment = require('moment');
var bodyParser = require('body-parser');
var async = require('async');
var fs = require('fs');
var goal = Number(config.GOAL);
var fillPlayerData = require('./fillPlayerData');
//var cpuCount = require('os').cpus().length;
// Include the cluster module
var cluster = require('cluster');
// Include Express
var express = require('express');
// Create a new Express application
var app = express();
var example_match = JSON.parse(fs.readFileSync('./matches/1408333834.json'));
/*
if (config.NODE_ENV === "test") {
    //don't cluster in test env
    configureApp(app);
} else {
    if (cluster.isMaster) {
        // Count the machine's CPUs
        // Create a worker for each CPU
        for (var i = 0; i < cpuCount; i += 1) {
            cluster.fork();
        }
    }
    else {
        configureApp(app);
    }
}
*/
var server = app.listen(config.PORT, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[WEB] listening at http://%s:%s', host, port);
});
require('./socket.js')(server);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.moment = moment;
app.locals.constants = require('./constants.json');
app.locals.sources = require('./sources.json');
app.locals.basedir = __dirname + '/views';
app.use(compression());
var basic = auth.basic({
    realm: "Kue"
}, function(username, password, callback) { // Custom authentication method.
    callback(username === config.KUE_USER && password === config.KUE_PASS);
});
app.use("/kue", auth.connect(basic));
app.use("/kue", kue.app);
app.use("/public", express.static(path.join(__dirname, '/public')));
app.use(session({
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
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(function(req, res, next) {
    async.parallel({
        banner: function(cb) {
            redis.get("banner", cb);
        },
        apiDown: function(cb) {
            redis.get("apiDown", cb);
        },
        cheese: function(cb) {
            redis.get("cheese_goal", cb);
        }
    }, function(err, results) {
        res.locals.user = req.user;
        res.locals.banner_msg = results.banner;
        res.locals.api_down = Number(results.apiDown);
        var theGoal = Number(results.cheese || 0.1) / goal * 100;
        res.locals.cheese_goal = (theGoal - 100) > 0 ? 100 : theGoal;
        logger.info("%s visit %s", req.user ? req.user.account_id : "anonymous", req.originalUrl);
        return next(err);
    });
});
var Poet = require('poet');
var poet = new Poet(app);
poet.watch(function() {
    // watcher reloaded
}).init().then(function() {
    // Ready to go!
});
app.get('/robots.txt', function(req, res) {
    res.type('text/plain');
    res.send("User-agent: *\nDisallow: /players");
});
app.route('/').get(function(req, res, next) {
    res.render('home', {
        match: example_match,
        truncate: [2, 6], // if tables should be truncated, pass in an array of which players to display
        home: true
    });
});
app.route('/live').get(function(req, res) {
    //TODO index page to list currently live matches and pro games
    //link to parsed match page and live match page (if available)
    //individual live match page for each match
    //interval check api
    //for each match, if time changed, update redis, push to clients
    utility.getData(utility.generateJob("api_live").url, function(err, data) {
        res.render('live', {
            live: data
        });
    });
});
app.route('/request').get(function(req, res) {
    res.render('request', {
        rc_public: rc_public
    });
});
app.use('/ratings', function(req, res, next) {
    db.players.find({
        "ratings": {
            $ne: null
        }
    }, function(err, docs) {
        if (err) {
            return next(err);
        }
        docs.forEach(function(d) {
            d.soloCompetitiveRank = d.ratings[d.ratings.length - 1].soloCompetitiveRank;
        });
        docs.sort(function(a, b) {
            return b.soloCompetitiveRank - a.soloCompetitiveRank;
        });
        res.render("ratings", {
            ratings: docs
        });
    });
});
app.route('/preferences').post(function(req, res) {
    if (req.user) {
        for (var key in req.body) {
            //convert string to boolean
            req.body[key] = req.body[key] === "true";
        }
        db.players.update({
            account_id: req.user.account_id
        }, {
            $set: req.body
        }, function(err, num) {
            var success = !(err || !num);
            res.json({
                prefs: req.body,
                sync: success
            });
        });
    }
    else {
        res.json({
            sync: false
        });
    }
});
app.route('/status').get(function(req, res, next) {
    status(function(err, result) {
        if (err) {
            return next(err);
        }
        res.render("status", {
            result: result
        });
    });
});
app.route('/faq').get(function(req, res) {
    res.render("faq", {
        questions: poet.helpers.postsWithTag("faq").reverse()
    });
});
app.route('/compare').get(function(req, res, next) {
    //TODO pick up account ids to analyze from parsing querystring, comma-separated, parse into array
    //TODO limit compare to 5 people (+all/professional)
    var account_ids = ["all", "professional", 88367253];
    var qCopy = JSON.parse(JSON.stringify(req.query));
    async.mapSeries(account_ids, function(account_id, cb) {
        req.query = JSON.parse(JSON.stringify(qCopy));
        fillPlayerData(account_id, {
            query: {
                select: req.query,
                //limit results to reduce computation time
                limit: 300
            }
        }, function(err, player) {
            //create array of results.aggData for each account_id
            //compute average for aggregations supporting it
            for (var key in player.aggData) {
                if (player.aggData[key].sum && player.aggData[key].n) {
                    player.aggData[key].avg = player.aggData[key].sum / player.aggData[key].n;
                }
            }
            cb(err, {
                account_id: account_id,
                personaname: player.personaname,
                aggData: player.aggData
            });
        });
    }, function(err, results) {
        if (err) {
            return next(err);
        }
        //TODO compute percentile for each stat
        //for each avg in each player's aggdata, iterate through "all" counts and determine whether this average is gt/lt key, then add count to appropriate bucket. percentile is gt/(gt+lt)
        res.render("compare", {
            data: results,
            q: req.query
        });
    });
});
app.route('/compare').get(function(req, res, next) {
    //TODO pick up account ids to analyze from parsing querystring, comma-separated
    //parse the multiple account ids into array
    //TODO limit the results to return for comparison to save time, set req.query.limit?
    //TODO max compare 5 people (+all/professional)
    var account_ids = ["all", 88367253];
    async.map(account_ids, function(account_id, cb) {
        fillPlayerData(account_id, {
            query: req.query
        }, function(err, player) {
            //create array of results.aggData for each account_id
            //TODO compute average for each stat
            cb(err, {
                account_id: account_id,
                personaname: player.personaname,
                aggData: player.aggData
            });
        });
    }, function(err, results) {
        if (err) {
            return next(err);
        }
        //TODO compute percentile for each stat
        //iterate through "all" counts and determine whether this average is gt/lt key, then add count to appropriate bucket. percentile is gt/(gt+lt)
        res.render("compare", {
            data: results,
            q: req.query
        });
    });
});
app.use('/matches', require('./routes/matches'));
app.use('/players', require('./routes/players'));
app.use('/api', require('./routes/api'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/donate'));
app.use(function(req, res, next) {
    var err = new Error("Not Found");
    err.status = 404;
    return next(err);
});
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    console.log(err);
    if (config.NODE_ENV !== "development") {
        return res.render('error/' + (err.status === 404 ? '404' : '500'), {
            error: err
        });
    }
    //default express handler
    next(err);
});
module.exports = app;
