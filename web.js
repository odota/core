var express = require('express');
var Recaptcha = require('recaptcha').Recaptcha;
var rc_public = process.env.RECAPTCHA_PUBLIC_KEY;
var rc_secret = process.env.RECAPTCHA_SECRET_KEY;
var paypal_id = process.env.PAYPAL_ID;
var paypal_secret = process.env.PAYPAL_SECRET;
var root_url = process.env.ROOT_URL
var PAYMENT_SESSIONS  = ["cheeseAmount", "cheeseTotal", "payerId", "paymentId"]
var paypal = require('paypal-rest-sdk')
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
var server = app.listen(process.env.PORT || 5000, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[WEB] listening at http://%s:%s', host, port);
});
var io = require('socket.io')(server);
/*

io.sockets.on('connection', function(socket) {
    socket.on('send-file', function(name, buffer) {
        console.log(buffer.length);
        socket.emit('recFile');
    });
});
app.use("/socket", function(req, res){
    res.render("socket");
});
*/

paypal.configure({
  'mode': 'sandbox', //sandbox or live
  'client_id': paypal_id,
  'client_secret': paypal_secret
});


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
        client: redis,
        disableTTL: true
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
    async.parallel({
        banner: function(cb) {
            redis.get("banner", cb);
        },
        apiDown: function(cb) {
            redis.get("apiDown", cb);
        }
    }, function(err, results) {
        res.locals.user = req.user;
        res.locals.banner_msg = results.banner;
        res.locals.api_down = Number(results.apiDown);
        logger.info("%s visit", req.user ? req.user.account_id : "anonymous");
        return next(err);
    });
});
app.use('/matches', require('./routes/matches'));
app.use('/players', require('./routes/players'));
app.use('/api', require('./routes/api'));
app.use('/upload', require("./routes/upload"));
app.route('/').get(function(req, res, next) {
    queries.getRatingData(req, function(err, results) {
        if (err) {
            return next(err);
        }
        res.render('index.jade', results);
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
app.route('/return').get(passport.authenticate('steam', {
    failureRedirect: '/'
}), function(req, res) {
    res.redirect('/');
});
app.route('/logout').get(function(req, res) {
    req.logout();
    req.session.destroy(function() {
        res.redirect('/');
    });
});
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
app.route('/carry').get(function(req, res) {
    res.render("carry");
}).post(function(req, res) {
    var num = req.body.num
    
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
        
        paypal.payment.create(payment, function (err, payment) {
            if (err) {
                next(err)
            } else {
                req.session.paymentId = payment.id;
                req.session.cheeseAmount = num;
                var redirectUrl;
                for(var i=0; i < payment.links.length; i++) {
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
        })
    } else {
        clearPaymentSessions(req);
        res.render("cancel")
    }
}).post(function(req, res, next) {
    var paymentId = req.session.paymentId;
    var cheeseAmount = req.session.cheeseAmount;
    var payerId = req.session.payerId;
    var details = { "payer_id": payerId };
    
    paypal.payment.execute(paymentId, details, function (err, payment) {
        if (err) {
            clearPaymentSessions(req)
            next(err);
        } else {
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
            } else {
                res.redirect("/thanks");
            }
        }
    });
})
app.route('/thanks').get(function(req, res) {
    var cheeseCount = req.session.cheeseAmount;
    var cheeseTotal = req.session.cheeseTotal;
    clearPaymentSessions(req);
    res.render("thanks", {
        cheese: cheeseCount,
        total: req.session.cheeseTotal
    });
});
app.route('/cancel').get(function(req, res) {
    clearPaymentSessions(req);
    res.render("cancel");
})
app.use(function(req, res, next) {
    var err = new Error("Not Found");
    err.status = 404;
    return next(err);
});
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    console.log(err);
    if (process.env.NODE_ENV !== "development") {
        return res.render(err.status === 404 ? '404' : '500', {
            error: err
        });
    }
    //default express handler
    next(err);
});

function clearPaymentSessions(req) {
    PAYMENT_SESSIONS.forEach(function(s){
        req.session[s] = null;
    })
}