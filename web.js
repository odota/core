var dotenv = require('dotenv');
dotenv.load();
var express = require('express');
var session = require('cookie-session');
var multer = require('multer');
var utility = require('./utility'),
    auth = require('http-auth'),
    async = require('async'),
    path = require('path'),
    winston = require('winston'),
    passport = require('passport'),
    moment = require('moment'),
    Recaptcha = require('recaptcha').Recaptcha,
    // bodyParser = require('body-parser'),
    matches = utility.matches,
    players = utility.players,
    kue = utility.kue,
    jobs = utility.jobs,
    redis = utility.redis,
    SteamStrategy = require('passport-steam').Strategy,
    app = express();
var host = process.env.ROOT_URL,
    rc_public = process.env.RECAPTCHA_PUBLIC_KEY,
    rc_secret = process.env.RECAPTCHA_SECRET_KEY;
var transports = [new(winston.transports.Console)(),
    new(winston.transports.File)({
        filename: 'web.log',
        level: 'info'
    })
];
var logger = new(winston.Logger)({
    transports: transports
});
var matchPages = {
    index: {
        template: "match_index",
        name: "Match"
    },
    details: {
        template: "match_details",
        name: "Details"
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
    }
};
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.moment = moment;
app.locals.constants = require('./constants.json');
passport.serializeUser(function(user, done) {
    done(null, user.account_id);
});
passport.deserializeUser(function(id, done) {
    players.findAndModify({
        query: {
            account_id: id
        },
        update: {
            $set: {
                last_visited: new Date()
            }
        }
    }, function(err, user) {
        done(err, user);
    });
});
passport.use(new SteamStrategy({
    returnURL: host + '/return',
    realm: host,
    apiKey: process.env.STEAM_API_KEY || "null"
}, function(identifier, profile, done) { // start tracking the player
    var steam32 = Number(utility.convert64to32(identifier.substr(identifier.lastIndexOf("/") + 1)));
    var insert = profile._json;
    insert.account_id = steam32;
    insert.track = 1;
    insert.last_visited = new Date(); // $currentDate only exists in Mongo >= 2.6
    players.findAndModify({
        account_id: steam32
    }, {
        $set: insert
    }, {
        upsert: true,
        new: false
    }, function(err, user) {
        if (err) return done(err, null);
        console.log(user)
        return done(null, {
            account_id: steam32,
            untracked: (user && user.track === 0) ? true : false // If set to 0, we untracked them
        });
    });
}));
var basic = auth.basic({
    realm: "Kue"
}, function(username, password, callback) { // Custom authentication method.
    callback(username === process.env.KUE_USER && password === process.env.KUE_PASS);
});
app.use("/kue", auth.connect(basic));
app.use("/kue", kue.app);
app.use("/public", express.static(path.join(__dirname, '/public')));
app.use(session({
    maxAge: 1000 * 60 * 60 * 24 * 14, //2 weeks in ms
    secret: process.env.SESSION_SECRET
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(function(req, res, next) {
    redis.get("banner", function(err, reply) {
        app.locals.user = req.user;
        if (err || !reply) {
            app.locals.banner_msg = false;
            next();
        }
        else {
            app.locals.banner_msg = reply;
            next();
        }
    });
});
app.param('match_id', function(req, res, next, id) {
    redis.get(id, function(err, reply) {
        if (err || !reply) {
            logger.info("Cache miss for match " + id);
            matches.findOne({
                match_id: Number(id)
            }, function(err, match) {
                if (err || !match) {
                    return next();
                }
                else {
                    utility.fillPlayerNames(match.players, function(err) {
                        req.match = match;
                        //Add to cache if we have parsed data
                        if (match.parsed_data && process.env.NODE_ENV === "production") {
                            redis.setex(id, 86400, JSON.stringify(match));
                        }
                        return next()
                    })
                }
            })
        }
        else if (reply) {
            logger.info("Cache hit for match " + id)
            req.match = JSON.parse(reply)
            return next()
        }
    })
})
app.route('/').get(function(req, res) {
    res.render('index.jade', {})
})
app.route('/api/items').get(function(req, res) {
    res.json(app.locals.constants.items[req.query.name])
})
app.route('/api/abilities').get(function(req, res) {
    res.json(app.locals.constants.abilities[req.query.name])
})
app.route('/api/matches').get(function(req, res) {
    var options = {};
    var sort = {};
    if (req.query.draw) {
        //var search = req.query.search.value
        //options = utility.makeSearch(search, req.query.columns)
        sort = utility.makeSort(req.query.order, req.query.columns)
    }
    utility.matches.count(options, function(err, count) {
        utility.matches.find(options, {
            limit: Number(req.query.length),
            skip: Number(req.query.start),
            sort: sort
        }, function(err, docs) {
            res.json({
                draw: Number(req.query.draw),
                recordsTotal: count,
                recordsFiltered: count,
                data: docs
            })
        })
    });
})
app.route('/matches').get(function(req, res) {
    res.render('matches.jade', {
        title: "Matches - YASP"
    })
})
app.route('/matches/:match_id/:info?').get(function(req, res, next) {
    var info = req.params.info || 'index'
    var match = req.match
    if (!matchPages[info]) {
        return next()
    }
    if (info === "details") {
        //loop through all heroes
        //look up corresponding hero_id
        //find player slot associated with that unit(hero_to_slot)
        //merge into player's primary hero
        for (var key in match.parsed_data.heroes) {
            var val = match.parsed_data.heroes[key]
            if (app.locals.constants.hero_names[key]) {
                var hero_id = app.locals.constants.hero_names[key].id;
                var slot = match.parsed_data.hero_to_slot[hero_id]
                if (slot) {
                    var primary = match.players[slot].hero_id
                    var primary_name = app.locals.constants.heroes[primary].name
                    var merge = match.parsed_data.heroes[primary_name]
                    if (!match.players[slot].hero_ids) {
                        match.players[slot].hero_ids = []
                    }
                    match.players[slot].hero_ids.push(hero_id);
                    if (key !== primary_name) {
                        mergeObjects(merge, val);
                    }
                }
            }
        }
    }

    function mergeObjects(merge, val) {
        for (var attr in val) {
            if (val[attr].constructor === Array) {
                merge[attr] = merge[attr].concat(val[attr])
            }
            else if (typeof val[attr] === "object") {
                mergeObjects(merge[attr], val[attr])
            }
            else {
                //does property exist?
                if (!merge[attr]) {
                    merge[attr] = val[attr]
                }
                else {
                    merge[attr] += val[attr]
                }

            }
        }
    }

    if (info === "graphs") {
        if (match.parsed_data) {
            //compute graphs
            var goldDifference = ['Gold']
            var xpDifference = ['XP']
            for (var i = 0; i < match.parsed_data.times.length; i++) {
                var goldtotal = 0
                var xptotal = 0
                match.parsed_data.players.forEach(function(elem, j) {
                    if (match.players[j].player_slot < 64) {
                        goldtotal += elem.gold[i]
                        xptotal += elem.xp[i]
                    }
                    else {
                        xptotal -= elem.xp[i]
                        goldtotal -= elem.gold[i]
                    }
                })
                goldDifference.push(goldtotal)
                xpDifference.push(xptotal)
            }
            var time = ["time"].concat(match.parsed_data.times)
            var data = {
                difference: [time, goldDifference, xpDifference],
                gold: [time],
                xp: [time],
                lh: [time]
            }
            match.parsed_data.players.forEach(function(elem, i) {
                var hero = app.locals.constants.heroes[match.players[i].hero_id].localized_name
                data.gold.push([hero].concat(elem.gold))
                data.xp.push([hero].concat(elem.xp))
                data.lh.push([hero].concat(elem.lh))
            })
        }
    }
    res.render(matchPages[info].template, {
        route: info,
        match: req.match,
        tabs: matchPages,
        data: data,
        title: "Match " + match.match_id + " - YASP"
    }, function(err, html) {
        if (err) return next(err);
        return res.send(html);
    });
});
app.route('/players').get(function(req, res) {
    players.find({}, function(err, docs) {
        res.render('players.jade', {
            players: docs,
            title: "Players - YASP"
        })
    })
})
app.route('/players/:account_id/:info?').get(function(req, res, next) {
    var info = req.params.info || 'index';
    if (!playerPages[info]) {
        return next();
    }
    players.findOne({
        account_id: Number(req.params.account_id)
    }, function(err, player) {
        if (!player) {
            return next();
        }
        else {
            utility.getMatches(player.account_id, function(err, matches) {
                var account_id = player.account_id
                var counts = {}
                var heroes = {}
                player.win = 0
                player.lose = 0
                player.games = 0
                player.teammates = []
                player.calheatmap = {}

                for (var i = 0; i < matches.length; i++) {
                    //add start time to data for cal-heatmap
                    player.calheatmap[matches[i].start_time] = 1;

                    //compute top heroes
                    for (var j = 0; j < matches[i].players.length; j++) {
                        var p = matches[i].players[j];
                        if (p.account_id === account_id) {
                            //find the "main" player's id
                            var playerRadiant = utility.isRadiant(p);
                            matches[i].player_win = (playerRadiant === matches[i].radiant_win);
                            matches[i].slot = j;
                            matches[i].player_win ? player.win += 1 : player.lose += 1;
                            player.games += 1
                            if (!heroes[p.hero_id]) {
                                heroes[p.hero_id] = {}
                                heroes[p.hero_id]["games"] = 0;
                                heroes[p.hero_id]["win"] = 0;
                                heroes[p.hero_id]["lose"] = 0;
                            }
                            heroes[p.hero_id]["games"] += 1;
                            if (matches[i].player_win) {
                                heroes[p.hero_id]["win"] += 1;
                            }
                            else {
                                heroes[p.hero_id]["lose"] += 1;
                            }
                        }
                    }
                    //compute top teammates
                    for (j = 0; j < matches[i].players.length; j++) {
                        var tm = matches[i].players[j];
                        if (utility.isRadiant(tm) === playerRadiant) { //teammates of player
                            if (!counts[tm.account_id]) {
                                counts[tm.account_id] = {
                                    account_id: tm.account_id,
                                    win: 0,
                                    lose: 0,
                                    games: 0
                                };
                            }
                            counts[tm.account_id]["games"] += 1;
                            matches[i].player_win ? counts[tm.account_id]["win"] += 1 : counts[tm.account_id]["lose"] += 1;
                        }
                    }
                }
                //convert teammate counts to array and filter
                for (var id in counts) {
                    var count = counts[id]
                    if (id != app.locals.constants.anonymous_account_id && id != player.account_id && count.games >= 2) {
                        player.teammates.push(count)
                    }
                }

                player.matches = matches
                player.heroes = heroes
                utility.fillPlayerNames(player.teammates, function(err) {
                    res.render(playerPages[info].template, {
                        route: info,
                        player: player,
                        tabs: playerPages,
                        title: (player.personaname || player.account_id) + " - YASP"
                    })
                })
            });
        }
    });
});
app.route('/login').get(passport.authenticate('steam', {
    failureRedirect: '/'
}));
app.route('/return').get(passport.authenticate('steam', {
    failureRedirect: '/'
}), function(req, res) {
    if (req.user) {
        app.locals.untracked = req.user.untracked;
        res.redirect('/players/' + req.user.account_id);
    }
    else {
        res.redirect('/');
    }
});
app.route('/logout').get(function(req, res) {
    req.logout();
    req.session = null;
    res.redirect('/');
});

app.use(multer({
    dest: './uploads',
    limits: {
        fileSize: 200000000
    }
}));

app.route('/verify_recaptcha')
    .post(function(req, res) {
         var data = {
            remoteip:  req.connection.remoteAddress,
            challenge: req.body.recaptcha_challenge_field,
            response:  req.body.recaptcha_response_field
        };
        
        var recaptcha = new Recaptcha(rc_public, rc_secret, data);
        console.log(req.body)
        recaptcha.verify(function(success, error_code) {
            res.json({verified: success})
        })
    })

app.route('/upload')
    .get(function(req, res) {
        var recaptcha = new Recaptcha(rc_public, rc_secret);
        res.render("upload", {
            recaptcha_form: recaptcha.toHTML(),
            rc_pass: true
        });
    })
    .post(function(req, res) {
        var data = {
            remoteip:  req.connection.remoteAddress,
            challenge: req.body.recaptcha_challenge_field,
            response:  req.body.recaptcha_response_field
        };
        
        var recaptcha = new Recaptcha(rc_public, rc_secret, data);
    
        recaptcha.verify(function(success, error_code) {
             if (success) {
                var files = req.files.replay;
                logger.info(files.fieldname + ' uploaded to  ' + files.path);
                utility.queueReq("upload", {
                    uploader: req.user,
                    fileName: files.path
                })
             }
             
            res.render("upload", {
                files: files,
                rc_pass: success,
                recaptcha_form: recaptcha.toHTML(),
            });
        });
    });

app.get('/stats', function(req, res, next) {
    async.parallel({
            matches: function(cb) {
                utility.matches.count({}, function(err, res) {
                    cb(err, res);
                });
            },
            players: function(cb) {
                utility.players.count({}, function(err, res) {
                    cb(err, res);
                });
            },
            tracked_players: function(cb) {
                utility.players.count({
                    track: 1
                }, function(err, res) {
                    cb(err, res);
                });
            },
            matches_last_day: function(cb) {
                utility.matches.count({
                    start_time: {
                        $gt: Number(moment().subtract(1, 'day').format('X'))
                    }
                }, function(err, res) {
                    cb(err, res);
                });
            },
            queued_jobs: function(cb) {
                jobs.inactiveCount(function(err, res) {
                    cb(err, res);
                });
            }
        },
        function(err, results) {
            if (err) {
                return next(err);
            }
            res.json(results);
        });
});

app.use(function(err, req, res, next) {
    if (err && process.env.NODE_ENV === "production") {
        logger.info(err);
        return res.status(500).render('500.jade', {
            error: true
        });
    }
    else {
        return next(err);
    }
});

app.use(function(req, res) {
    if (process.env.NODE_ENV === "production") {
        return res.status(404).render('404.jade', {
            error: true
        });
    }
});

// In order to reach the app from other modules
// we need to export the express application
module.exports.app = app;

var server = app.listen(process.env.PORT || 3000, function() {
    var host = server.address().address;
    var port = server.address().port;
    logger.info('[WEB] listening at http://%s:%s', host, port);
});