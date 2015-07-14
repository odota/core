var config = require('./config');
var rc_public = config.RECAPTCHA_PUBLIC_KEY;
var utility = require('./utility');
var r = require('./redis');
var redis = r.client;
var kue = r.kue;
var db = require('./db');
var logger = utility.logger;
var compression = require('compression');
var session = require('cookie-session');
//var session = require('express-session');
//var RedisStore = require('connect-redis')(session);
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
var advQuery = require('./advquery');
var queries = require('./queries');
var express = require('express');
var app = express();
var example_match = JSON.parse(fs.readFileSync('./matches/1408333834.json'));
var sticky = require('sticky-session');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.moment = moment;
app.locals.constants = require('./constants.json');
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
    res.send("User-agent: *\nDisallow: /players\nDisallow: /matches");
});
app.route('/').get(function(req, res, next) {
    if (req.user) {
        res.redirect('/players/' + req.user.account_id);
    }
    else {
        res.render('home', {
            match: example_match,
            truncate: [2, 6], // if tables should be truncated, pass in an array of which players to display
            home: true
        });
    }
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
    }, {
        fields: {
            "cache": 0
        }
    }, function(err, docs) {
        if (err) {
            return next(err);
        }
        docs.forEach(function(d) {
            d.soloCompetitiveRank = d.ratings[d.ratings.length - 1].soloCompetitiveRank;
            d.competitiveRank = d.ratings[d.ratings.length - 1].competitiveRank;
            d.time = d.ratings[d.ratings.length - 1].time;
        });
        docs.sort(function(a, b) {
            return b.soloCompetitiveRank - a.soloCompetitiveRank;
        });
        res.render("ratings", {
            ratings: docs
        });
    });
});
//TODO hopefully we can get rid of this and go to single-theme design
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
app.route('/professional').get(function(req, res, next) {
    //TODO implement live match pages
    //individual live match page for each match
    //interval check api
    //for each match, if time changed, update redis, push to clients
    advQuery({
        select: {
            leagueid: {
                $gt: 0
            }
        },
        project: {
            players: {
                $slice: 1
            },
            match_id: 1,
            leagueid: 1,
            radiant_name: 1,
            dire_name: 1,
            game_mode: 1,
            duration: 1,
            start_time: 1,
            parse_status: 1
        },
        js_agg: {},
        sort: {
            match_id: -1
        },
        limit: 100
    }, function(err, data2) {
        if (err) {
            return next(err);
        }
        res.render('professional', {
            recent: data2.data
        });
        /*
        utility.getData(utility.generateJob("api_live").url, function(err, data) {
                if (err) {
                    return next(err);
                }
                res.render('professional', {
                    live: data.result.games,
                    recent: data2.data
                });
        });
        */
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
if (config.NODE_ENV === "test" || true) {
    var server = app.listen(config.PORT, function() {
        console.log('[WEB] listening on %s', config.PORT);
    });
    require('./socket.js')(server);
}
else {
    sticky(4, function() {
        var server = app.listen(config.PORT, function() {
            console.log('[WEB] listening on %s', config.PORT);
        });
        require('./socket.js')(server);
        return server;
    });
}
