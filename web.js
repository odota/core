var express = require('express');
var config = require('./config');
var Recaptcha = require('recaptcha').Recaptcha;
var rc_public = config.RECAPTCHA_PUBLIC_KEY;
var rc_secret = config.RECAPTCHA_SECRET_KEY;
var paypal_id = config.PAYPAL_ID;
var paypal_secret = config.PAYPAL_SECRET;
var root_url = config.ROOT_URL;
var goal = Number(config.GOAL);
var PAYMENT_SESSIONS = ["cheeseAmount", "cheeseTotal", "payerId", "paymentId"];
var paypal = require('paypal-rest-sdk');
var utility = require('./utility');
var r = require('./redis');
var redis = r.client;
var kue = r.kue;
var db = require('./db');
var queries = require('./queries');
var logger = utility.logger;
var compression = require('compression');
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var app = express();
var passport = require('./passport');
var status = require('./status');
var auth = require('http-auth'),
    path = require('path'),
    moment = require('moment'),
    bodyParser = require('body-parser'),
    async = require('async');
var server = app.listen(config.PORT, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[WEB] listening at http://%s:%s', host, port);
});
var io = require('socket.io')(server);
/*
setInterval(function() {
    status(function(err, res) {
        if (!err) io.emit(res);
    });
}, 5000);
*/
var queueReq = require('./operations').queueReq;
io.sockets.on('connection', function(socket) {
    socket.on('match_id', function(match_id) {
        //todo implement rate limit
        match_id = Number(match_id);
        socket.emit('prog', 100);
        socket.emit('log', "received: " + match_id);
        queueReq("api_details", {
            match_id: match_id,
            request: true,
            priority: "high"
        }, function(err, job) {
            if (err) {
                return socket.emit('log', err);
            }
            socket.emit('log', "api: queued " + match_id);
            job.on('progress', function(prog) {
                socket.emit('log', prog + "%");
                //kue 0.9 should allow emitting additional data so we can capture api start, api finish, match expired, parse start
                socket.emit('prog', prog);
            });
            job.on('complete', function(result) {
                socket.emit('log', "request complete!");
                socket.emit('complete');
            });
        });
    });
});
paypal.configure({
    'mode': config.NODE_ENV === "production" ? 'live' : 'sandbox', //sandbox or live
    'client_id': paypal_id,
    'client_secret': paypal_secret
});
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.moment = moment;
app.locals.constants = require('./constants.json');
app.use(compression());
var basic = auth.basic({
    realm: "Kue"
}, function(username, password, callback) { // Custom authentication method.
    callback(username === config.KUE_USER && password === config.KUE_PASS);
});
app.use("/kue", auth.connect(basic));
app.use("/kue", kue.app);
app.use("/public", express.static(path.join(__dirname, '/public')));
app.use("/", express.static(path.join(__dirname, '/public')));
app.use("/bower_components", express.static(path.join(__dirname, '/bower_components')));
app.use(session({
    store: new RedisStore({
        client: redis,
        ttl: 52 * 7 * 24 * 60 * 60
    }),
    cookie: { maxAge: 52 * 7 * 24 * 60 * 60 * 1000},
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
var poet = Poet(app);
poet.watch(function() {
    // watcher reloaded
}).init().then(function() {
    // Ready to go!
});
app.use('/matches', require('./routes/matches'));
app.use('/players', require('./routes/players'));
app.use('/api', require('./routes/api'));
app.route('/').get(function(req, res, next) {
    queries.prepareMatch(1281139233, function(err, match) {
        res.render('home', {
            match: match
        });
    });
});
app.route('/request').get(function(req,res){
    res.render('request');
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
app.route('/login').get(passport.authenticate('steam', {
    failureRedirect: '/'
}));
app.route('/return').get(passport.authenticate('steam', {
    failureRedirect: '/'
}), function(req, res) {
    res.redirect('/players/' + req.user.account_id);
});
app.route('/logout').get(function(req, res) {
    req.logout();
    req.session.destroy(function() {
        res.redirect('/');
    });
});
/*
app.use('/upload', require("./routes/upload"));
app.route('/verify_recaptcha').post(function(req, res) {
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
*/
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
app.route('/about').get(function(req, res) {
    res.render("about");
});
app.route('/carry').get(function(req, res, next) {
    db.players.find({}, {
        sort: {
            cheese: -1
        },
        limit: 50
    }, function(err, results) {
        if (err) return next(err);
        res.render("carry", {
            users: results
        });
    });
}).post(function(req, res, next) {
    var num = req.body.num;
    if (!isNaN(num)) {
        var payment = {
            "intent": "sale",
            "payer": {
                "payment_method": "paypal"
            },
            "redirect_urls": {
                "return_url": root_url + "/confirm",
                "cancel_url": root_url + "/cancel"
            },
            "transactions": [{
                "amount": {
                    "total": num,
                    "currency": "USD"
                },
                "description": "Buying CHEESE x" + num
            }]
        };
        paypal.payment.create(payment, function(err, payment) {
            if (err) {
                return next(err)
            }
            else {
                req.session.paymentId = payment.id;
                req.session.cheeseAmount = num;
                var redirectUrl;
                for (var i = 0; i < payment.links.length; i++) {
                    var link = payment.links[i];
                    if (link.method === 'REDIRECT') {
                        redirectUrl = link.href;
                    }
                }
                res.redirect(redirectUrl);
            }
        });
    }
});
app.route('/confirm').get(function(req, res, next) {
    var cheeseAmount = req.session.cheeseAmount;
    req.session.payerId = req.query.PayerID;
    if (cheeseAmount) {
        res.render("confirm", {
            cheeseAmount: cheeseAmount
        });
    }
    else {
        clearPaymentSessions(req);
        res.render("cancel");
    }
}).post(function(req, res, next) {
    var paymentId = req.session.paymentId;
    var cheeseAmount = req.session.cheeseAmount;
    var payerId = req.session.payerId;
    var details = {
        "payer_id": payerId
    };
    paypal.payment.execute(paymentId, details, function(err, payment) {
        if (err) {
            clearPaymentSessions(req);
            next(err);
        }
        else {
            redis.incrby("cheese_goal", cheeseAmount, function(err, val) {
                if (!err && val == cheeseAmount) {
                    // cheeseAmount is string, val is number, just let JS cast
                    // this condition indicates the key is new
                    redis.expire("cheese_goal", 86400 - moment().unix() % 86400);
                }
                if (req.user && payment.transactions[0]) {
                    var cheeseTotal = (req.user.cheese || 0) + parseInt(payment.transactions[0].amount.total)
                    db.players.update({
                        account_id: req.user.account_id
                    }, {
                        $set: {
                            "cheese": cheeseTotal
                        }
                    }, function(err, num) {
                        req.session.cheeseTotal = cheeseTotal;
                        res.redirect("/thanks");
                    });
                }
                else {
                    res.redirect("/thanks");
                }
            })
        }
    });
});
app.route('/thanks').get(function(req, res) {
    var cheeseCount = req.session.cheeseAmount;
    var cheeseTotal = req.session.cheeseTotal;
    clearPaymentSessions(req);
    res.render("thanks", {
        cheese: cheeseCount,
        total: cheeseTotal
    });
});
app.route('/cancel').get(function(req, res) {
    clearPaymentSessions(req);
    res.render("cancel");
});
app.use(function(req, res, next) {
    var err = new Error("Not Found");
    err.status = 404;
    return next(err);
});
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    console.log(err);
    if (config.NODE_ENV !== "development") {
        return res.render(err.status === 404 ? '404' : '500', {
            error: err
        });
    }
    //default express handler
    next(err);
});

function clearPaymentSessions(req) {
    PAYMENT_SESSIONS.forEach(function(s) {
        req.session[s] = null;
    });
}

module.exports = app;