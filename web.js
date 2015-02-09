var express = require('express');
var Recaptcha = require('recaptcha').Recaptcha;
var rc_public = process.env.RECAPTCHA_PUBLIC_KEY;
var rc_secret = process.env.RECAPTCHA_SECRET_KEY;
var utility = require('./utility');
var redis = utility.redis;
var db = require('./db');
var logger = utility.logger;
var compression = require('compression');
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var app = express();
var passport = require('./passport');
var queries = require('./queries'),
    auth = require('http-auth'),
    path = require('path'),
    moment = require('moment'),
    bodyParser = require('body-parser'),
    kue = utility.kue;
var matchPages = {
    index: {
        template: "match_index",
        name: "Match"
    },
    details: {
        template: "match_details",
        name: "Details"
    },
    timelines: {
        template: "match_timelines",
        name: "Timelines"
    },
    graphs: {
        template: "match_graphs",
        name: "Graphs"
    },
    chat: {
        template: "match_chat",
        name: "Chat"
    }
};
var playerPages = {
    index: {
        template: "player_index",
        name: "Player"
    },
    matches: {
        template: "player_matches",
        name: "Matches"
    },
    heroes: {
        template: "player_heroes",
        name: "Heroes"
    },
    matchups: {
        template: "player_matchups",
        name: "Matchups"
    }
};
var server = app.listen(process.env.PORT || 5000, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[WEB] listening at http://%s:%s', host, port);
});
var io = require('socket.io')(server);
require('./status')(io);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.moment = moment;
app.locals.constants = require('./constants.json');
var basic = auth.basic({
    realm: "Kue"
}, function(username, password, callback) { // Custom authentication method.
    callback(username === process.env.KUE_USER && password === process.env.KUE_PASS);
});
app.use(compression());
app.use("/kue", auth.connect(basic));
app.use("/kue", kue.app);
app.use("/public", express.static(path.join(__dirname, '/public')));
app.use(session({
    store: new RedisStore({
        client: redis
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(function(req, res, next) {
    redis.get("banner", function(err, reply) {
        res.locals.user = req.user;
        res.locals.banner_msg = reply;
        logger.info("%s visit", req.user ? req.user.account_id : "anonymous");
        next(err);
    });
});
app.param('match_id', function(req, res, next, id) {
    redis.get(id, function(err, reply) {
        if (!err && reply) {
            logger.info("Cache hit for match " + id);
            req.match = JSON.parse(reply);
            return next();
        }
        else {
            logger.info("Cache miss for match " + id);
            db.matches.findOne({
                match_id: Number(id)
            }, function(err, match) {
                if (err || !match) {
                    return next(new Error("match not found"));
                }
                else {
                    queries.fillPlayerNames(match.players, function(err) {
                        if (err) {
                            return next(new Error(err));
                        }
                        req.match = match;
                        if (match.parsed_data) {
                            queries.mergeMatchData(match, app.locals.constants);
                            queries.generateGraphData(match, app.locals.constants);
                        }
                        //Add to cache if we have parsed data
                        if (match.parsed_data && process.env.NODE_ENV !== "development") {
                            redis.setex(id, 86400, JSON.stringify(match));
                        }
                        return next();
                    });
                }
            });
        }
    });
});
app.route('/').get(function(req, res) {
    res.render('index.jade', {});
});
app.route('/matches').get(function(req, res) {
    res.render('matches.jade', {
        title: "Matches - YASP"
    });
});
app.route('/matches/:match_id/:info?').get(function(req, res, next) {
    var match = req.match;
    var info = req.params.info || "index";
    //handle bad info
    if (!matchPages[info]) {
        return next(new Error("page not found"));
    }
    res.render(matchPages[info].template, {
        route: info,
        match: match,
        tabs: matchPages,
        title: "Match " + match.match_id + " - YASP"
    });
});
app.route('/players/:account_id/:info?').get(function(req, res, next) {
    var account_id = Number(req.params.account_id);
    var info = req.params.info || "index";
    //handle bad info
    if (!playerPages[info]) {
        return next(new Error("page not found"));
    }
    db.players.findOne({
        account_id: account_id
    }, function(err, player) {
        if (err || !player || account_id === app.locals.constants.anonymous_account_id) {
            return next(new Error("player not found"));
        }
        else {
            queries.fillPlayerMatches(player, app.locals.constants, info === "matchups", function(err) {
                if (err) {
                    return next(err);
                }
                res.render(playerPages[info].template, {
                    route: info,
                    player: player,
                    tabs: playerPages,
                    title: (player.personaname || player.account_id) + " - YASP"
                });
            });
        }
    });
});
app.route('/preferences').post(function(req, res) {
    if (req.user) {
        db.players.update({
            account_id: req.user.account_id
        }, {
            $set: {
                "dark_theme": req.body.dark === 'true' ? 1 : 0
            }
        }, function(err, num) {
            var success = !(err || !num);
            res.json({
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
app.route('/login').get(passport.authenticate('steam', {
    failureRedirect: '/'
}));
app.route('/return').get(
    passport.authenticate('steam', {
        failureRedirect: '/'
    }),
    function(req, res) {
        res.redirect('/');
    }
);
app.route('/logout').get(function(req, res) {
    req.logout();
    req.session.destroy(function() {
        res.redirect('/');
    });
});

app.route('/verify_recaptcha')
    .post(function(req, res) {
        var data = {
            remoteip: req.connection.remoteAddress,
            challenge: req.body.recaptcha_challenge_field,
            response: req.body.recaptcha_response_field
        };
        var recaptcha = new Recaptcha(rc_public, rc_secret, data);
        recaptcha.verify(function(success) {
            req.session.captcha_verified = success;
            res.json({
                verified: success
            });
        });
    });
app.route('/status').get(function(req, res) {
    res.render("status");
});
app.route('/about').get(function(req, res) {
    res.render("about");
});
app.use("/api", require('./routes/api'));
app.use('/upload', require("./routes/upload"));
app.use(function(req, res, next) {
    var err = new Error("Not Found");
    err.status = 404;
    next(err);
});
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    if (process.env.NODE_ENV !== "development") {
        return res.render(err.status === 404 ? '404.jade' : '500.jade', {
            error: err
        });
    }
    //default express handler
    next(err);
});