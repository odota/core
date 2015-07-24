var config = require('./config');
var rc_public = config.RECAPTCHA_PUBLIC_KEY;
var rc_secret = config.RECAPTCHA_SECRET_KEY;
var utility = require('./utility');
var request = require('request');
var queueReq = require('./operations').queueReq;
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
    advQuery({
        mongo_select: {
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
        //pass something non-null to skip getting parsed data
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
            matches: data2.data
        });
        /*
        //implement live match pages
        //individual live match page for each match
        //interval check api
        //for each match, if time changed, update redis, push to clients
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
//post/get a request
app.route('/request_job').post(function(req, res) {
    request.post("https://www.google.com/recaptcha/api/siteverify", {
        form: {
            secret: rc_secret,
            response: req.body.response
        }
    }, function(err, resp, body) {
        try {
            body = JSON.parse(body);
        }
        catch (err) {
            res.render({
                error: err
            });
        }
        var match_id = req.body.match_id;
        match_id = Number(match_id);
        if (!body.success && config.NODE_ENV !== "test"
            // if the DISABLE_RECAPTCHA env var has been set, ignore a bad body.success
            && !config.DISABLE_RECAPTCHA) {
            console.log('failed recaptcha');
            res.json({
                error: "Recaptcha Failed!"
            });
        }
        else if (!match_id) {
            console.log("invalid match id");
            res.json({
                error: "Invalid Match ID!"
            });
        }
        else {
            queueReq("request", {
                match_id: match_id,
                request: true
            }, function(err, job) {
                res.json({
                    error: err,
                    job: job
                });
            });
        }
    });
}).get(function(req, res) {
    kue.Job.get(req.query.id, function(err, job) {
        res.json({
            error: err,
            job: job ? job.toJSON() : null
        });
    });
});
/*
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
*/
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
var port = config.WEB_PORT || config.PORT;
var num_processes = require('os').cpus().length;
var cluster = require('cluster');
if (true) {
    //vanilla node clustering, doesn't work with socket.io
    if (cluster.isMaster && config.NODE_ENV !== "test") {
        var workers = [];
        var spawn = function(i) {
            workers[i] = cluster.fork();
            // Optional: Restart worker on exit
            workers[i].on('exit', function(worker, code, signal) {
                console.log('respawning worker', i);
                spawn(i);
            });
        };
        // Spawn workers.
        for (var i = 0; i < num_processes; i++) {
            spawn(i);
        }
    }
    else {
        var server = app.listen(port, function() {
            console.log('[WEB] listening on %s', port);
        });
        //require('./socket.js')(server);
    }
}
else {
    //sticky session clustering, required to work with socket.io
    var net = require('net');
    if (cluster.isMaster) {
        // This stores our workers. We need to keep them to be able to reference
        // them based on source IP address. It's also useful for auto-restart,
        // for example.
        var workers = [];
        // Helper function for spawning worker at index 'i'.
        var spawn = function(i) {
            workers[i] = cluster.fork();
            // Optional: Restart worker on exit
            workers[i].on('exit', function(worker, code, signal) {
                console.log('respawning worker', i);
                spawn(i);
            });
        };
        // Spawn workers.
        for (var i = 0; i < num_processes; i++) {
            spawn(i);
        }
        var worker_index = function(ip, len) {
            console.log(ip);
            var s = '';
            for (var i = 0, _len = ip.length; i < _len; i++) {
                if (parseInt(ip[i], 10)) {
                    s += ip[i];
                }
            }
            return Number(s) % len || 0;
        };
        // Create the outside facing server listening on our port.
        var server = net.createServer({
            pauseOnConnect: true
        }, function(connection) {
            // We received a connection and need to pass it to the appropriate
            // worker. Get the worker for this connection's source IP and pass
            // it the connection.
            var worker = workers[worker_index(connection.remoteAddress, num_processes)];
            worker.send('sticky-session:connection', connection);
        }).listen(port);
    }
    else {
        // Here you might use middleware, attach routes, etc.
        // Don't expose our internal server to the outside.
        var server = app.listen(0, 'localhost');
        require('./socket')(server);
        // Listen to messages sent from the master. Ignore everything else.
        process.on('message', function(message, connection) {
            if (message !== 'sticky-session:connection') {
                return;
            }
            // Emulate a connection event on the server by emitting the
            // event with the connection the master sent us.
            server.emit('connection', connection);
            connection.resume();
        });
    }
}