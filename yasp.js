var dotenv = require('dotenv');
dotenv.load();
var express = require('express');
var session = require('cookie-session');
var multer = require('multer');
var utility = require('./utility'),
    auth = require('http-auth'),
    async = require('async'),
    path = require('path'),
    passport = require('passport'),
    moment = require('moment'),
    Recaptcha = require('recaptcha').Recaptcha,
    bodyParser = require('body-parser'),
    matches = utility.matches,
    players = utility.players,
    fs = require('fs'),
    kue = utility.kue,
    redis = utility.redis,
    SteamStrategy = require('passport-steam').Strategy,
    app = express();
var host = process.env.ROOT_URL,
    rc_public = process.env.RECAPTCHA_PUBLIC_KEY,
    rc_secret = process.env.RECAPTCHA_SECRET_KEY,
    recaptcha = new Recaptcha(rc_public, rc_secret);
var logger = utility.logger;
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
    apiKey: process.env.STEAM_API_KEY
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
        upsert: true
    }, function(err, user) {
        if (err) return done(err, null);
        return done(null, {
            account_id: steam32,
            //todo why not just check user.track===0 to see if untracked?  It doesn't exist on other players
            untracked: (user && user.track === 0) ? true : false // If set to 0, we untracked them
        });
    });
}));
var basic = auth.basic({
    realm: "Kue"
}, function(username, password, callback) { // Custom authentication method.
    callback(username === (process.env.KUE_USER || "user") && password === (process.env.KUE_PASS || "pass"));
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
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(function(req, res, next) {
    redis.get("banner", function(err, reply) {
        app.locals.user = req.user;
        app.locals.login_req_msg = req.session.login_required;
        req.session.login_required = false;
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
                        return next();
                    });
                }
            });
        }
        else if (reply) {
            logger.info("Cache hit for match " + id);
            req.match = JSON.parse(reply);
            return next();
        }
    });
});
app.route('/').get(function(req, res) {
    res.render('index.jade', {});
});
app.route('/api/items').get(function(req, res) {
    res.json(app.locals.constants.items[req.query.name]);
});
app.route('/api/abilities').get(function(req, res) {
    res.json(app.locals.constants.abilities[req.query.name]);
});
app.route('/api/matches').get(function(req, res) {
    var options = {};
    var sort = {};
    if (req.query.draw) {
        //var search = req.query.search.value
        //options = utility.makeSearch(search, req.query.columns)
        sort = utility.makeSort(req.query.order, req.query.columns);
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
            });
        });
    });
});
app.route('/matches').get(function(req, res) {
    res.render('matches.jade', {
        title: "Matches - YASP"
    });
});
app.route('/matches/:match_id/:info?').get(function(req, res, next) {
    var info = req.params.info || 'index';
    var match = req.match;
    if (!matchPages[info]) {
        return next();
    }
    if (info === "details") {
        //loop through all heroes
        //look up corresponding hero_id
        //find player slot associated with that unit(hero_to_slot)
        //merge into player's primary hero
        for (var key in match.parsed_data.heroes) {
            var val = match.parsed_data.heroes[key];
            if (app.locals.constants.hero_names[key]) {
                var hero_id = app.locals.constants.hero_names[key].id;
                var slot = match.parsed_data.hero_to_slot[hero_id];
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
            var goldDifference = ['Gold'];
            var xpDifference = ['XP'];
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
                    var count = counts[id];
                    if (id != app.locals.constants.anonymous_account_id && id != player.account_id && count.games >= 2) {
                        player.teammates.push(count);
                    }
                }

                player.matches = matches;
                player.heroes = heroes;
                utility.fillPlayerNames(player.teammates, function(err) {
                    res.render(playerPages[info].template, {
                        route: info,
                        player: player,
                        tabs: playerPages,
                        title: (player.personaname || player.account_id) + " - YASP"
                    });
                });
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
            remoteip: req.connection.remoteAddress,
            challenge: req.body.recaptcha_challenge_field,
            response: req.body.recaptcha_response_field
        };

        var recaptcha = new Recaptcha(rc_public, rc_secret, data);

        recaptcha.verify(function(success, error_code) {
            req.session.captcha_verified = success;
            res.json({
                verified: success
            });
        });
    });

app.route('/upload')
    .all(function(req, res, next) {
        if (req.user) {
            next();
        }
        else {
            req.session.login_required = "upload";
            res.redirect("/");
        }
    })
    .get(function(req, res) {
        res.render("upload", {
            recaptcha_form: recaptcha.toHTML(),
            rc_pass: true
        });
    })
    .post(function(req, res) {
        var files = req.files.replay;
        if (req.session.captcha_verified && files) {
            logger.info(files.fieldname + ' uploaded to  ' + files.path);
            utility.queueReq("upload", {
                uploader: req.user,
                fileName: files.path
            }, function(err) {
                if (err) return logger.info(err);
            });
        }

        var verified = req.session.captcha_verified;
        req.session.captcha_verified = false; //Set back to false
        res.render("upload", {
            files: files,
            rc_pass: verified,
            recaptcha_form: recaptcha.toHTML(),
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
            formerly_tracked_players: function(cb) {
                utility.players.count({
                    track: 0
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
            queued_matches: function(cb) {
                utility.matches.count({
                    parse_status: 0
                }, function(err, res) {
                    cb(err, res);
                });
            },
            unavailable_matches: function(cb) {
                utility.matches.count({
                    parse_status: 1
                }, function(err, res) {
                    cb(err, res);
                });
            },
            parsed_matches: function(cb) {
                utility.matches.count({
                    parse_status: 2
                }, function(err, res) {
                    cb(err, res);
                });
            },
            uploaded_matches: function(cb) {
                utility.matches.count({
                    upload: true
                }, function(err, res) {
                    cb(err, res);
                });
            },
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

var jobs = utility.jobs;
var trackedPlayers = {};

utility.clearActiveJobs('api', function(err) {
    if (err) {
        logger.info(err);
    }
    jobs.process('api', processApiReq);
});

utility.clearActiveJobs('upload', function(err) {
    if (err) {
        logger.info(err);
    }
    jobs.process('upload', processUpload);
});

if (process.env.START_SEQ_NUM === "AUTO") {
    utility.getCurrentSeqNum(function(num) {
        getMatches(num);
    });
}
else if (process.env.START_SEQ_NUM) {
    getMatches(process.env.START_SEQ_NUM);
}
else {
    //start at highest id in db
    matches.findOne({
        upload: {
            $exists: false
        }
    }, {
        sort: {
            match_seq_num: -1
        }
    }, function(err, doc) {
        if (err) {
            logger.info(err);
        }
        getMatches(doc ? doc.match_seq_num + 1 : 0);
    });
}
setInterval(function untrackPlayers() {
    logger.info("[UNTRACK] Untracking users...");
    players.update({
        last_visited: {
            $lt: moment().subtract(process.env.UNTRACK_INTERVAL_DAYS || 3, 'days').toDate()
        }
    }, {
        $set: {
            track: 0
        }
    }, {
        multi: true
    }, function(err, num) {
        if (err) {
            logger.info(err);
        }
        logger.info("[UNTRACK] Untracked %s users", num);
    });
}, 60 * 60 * 1000); //check every hour

var server = app.listen(process.env.PORT || 3000, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[WEB] listening at http://%s:%s', host, port);
});

function getMatches(seq_num) {
    players.find({
        track: 1
    }, function(err, docs) {
        if (err) {
            return getMatches(seq_num);
        }
        //rebuild set of tracked players before every check
        trackedPlayers = {};
        docs.forEach(function(player) {
            trackedPlayers[player.account_id] = true;
        });
        var url = utility.api_url + "/GetMatchHistoryBySequenceNum/V001/?key=" + process.env.STEAM_API_KEY + "&start_at_match_seq_num=" + seq_num;
        utility.getData(url, function(err, data) {
            if (err) {
                return getMatches(seq_num);
            }
            var resp = data.result.matches;
            logger.info("[API] seq_num: %s, found %s matches", seq_num, resp.length);
            async.mapSeries(resp, insertMatch, function(err) {
                if (err) {
                    return getMatches(seq_num);
                }
                if (resp.length > 0) {
                    seq_num = resp[resp.length - 1].match_seq_num + 1;
                }
                return getMatches(seq_num);
            });
        });
    });
}

function processApiReq(job, cb) {
    //process an api request
    var payload = job.data.payload;
    if (!job.data.url) {
        logger.info(job);
        cb("no url");
    }
    utility.getData(job.data.url, function(err, data) {
        if (err) {
            return cb(err);
        }
        if (data.response) {
            //summaries response
            async.map(data.response.players, insertPlayer, function(err) {
                cb(err);
            });
        }
        else if (payload.match_id) {
            //response for single match details
            var match = data.result;
            insertMatch(match, function(err) {
                cb(err);
            });
        }
        else if (payload.account_id) {
            //response for match history for single player
            var resp = data.result.matches;
            async.map(resp, function(match, cb2) {
                utility.queueReq("api_details", match, function(err) {
                    cb2(err);
                });
            }, function(err) {
                cb(err);
            });
        }
    });
}

function insertMatch(match, cb) {
    var track = match.players.some(function(element) {
        return (element.account_id in trackedPlayers);
    });
    //queued or untracked
    match.parse_status = (track ? 0 : 3);
    if (track || match.upload) {
        var summaries = {
            summaries_id: new Date(),
            players: match.players
        };
        //queue for player names
        utility.queueReq("api_summaries", summaries, function(err) {
            if (err) return logger.info(err);
        });
        //parse if unparsed
        if (match.parsed_data) {
            match.parse_status = 2;
        }
        else {
            utility.queueReq("parse", match, function(err) {
                if (err) return logger.info(err);
            });
        }
        matches.update({
                match_id: match.match_id
            }, {
                $set: match
            }, {
                upsert: true
            },
            function(err) {
                cb(err);
            });
    }
    else {
        cb(null);
    }
}

function insertPlayer(player, cb) {
    var account_id = Number(utility.convert64to32(player.steamid));
    player.last_summaries_update = new Date();
    players.update({
        account_id: account_id
    }, {
        $set: player
    }, {
        upsert: true
    }, function(err) {
        cb(err);
    });
}

function processUpload(job, cb) {
    var fileName = job.data.payload.fileName;
    utility.runParse(fileName, function(code, output) {
        fs.unlink(fileName, function(err) {
            logger.info(err);
        });
        if (!code) {
            var api_container = utility.generateJob("api_details", {
                match_id: output.match_id
            });
            //check api to fill rest of match info
            utility.getData(api_container.url, function(err, body) {
                if (err) {
                    return cb(err);
                }
                var match = body.result;
                match.parsed_data = output;
                match.upload = true;
                insertMatch(match, function(err) {
                    cb(err);
                });
            });
        }
        else {
            //only try once, mark done regardless of result
            cb(null);
        }
    });
}

module.exports.app = app;
