var express = require('express');
var session = require('cookie-session');
var utility = require('./utility'),
    matches = utility.matches,
    players = utility.players,
    async = require('async'),
    fs = require('fs'),
    path = require('path'),
    winston = require('winston'),
    passport = require('passport'),
    cache = utility.redis,
    SteamStrategy = require('passport-steam').Strategy,
    app = express();
var port = Number(process.env.PORT || 3000);
var logger = new(winston.Logger)({
    transports: [
        new(winston.transports.File)({
            filename: 'app.log',
            level: 'info'
        })
    ]
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
    timelines: {
        template: "match_timelines",
        name: "Timelines"
    },
    chat: {
        template: "match_chat",
        name: "Chat"
    }
}
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
    teammates: {
        template: "player_teammates",
        name: "Teammates"
    }
}
app.listen(port, function() {
    logger.info("[WEB] listening on port %s", port)
})
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'jade');
app.locals.moment = require('moment');
var host = process.env.ROOT_URL
passport.serializeUser(function(user, done) {
    done(null, user.account_id);
});
passport.deserializeUser(function(id, done) {
    players.findOne({
        account_id: id
    }, function(err, user) {
        done(err, user)
    })
});
passport.use(new SteamStrategy({
    returnURL: host + '/return',
    realm: host,
    apiKey: process.env.STEAM_API_KEY
}, function(identifier, profile, done) { // start tracking the player
    steam32 = Number(utility.convert64to32(identifier.substr(identifier.lastIndexOf("/") + 1)))
    var insert = profile._json
    insert.account_id = steam32
    insert.track = 1
    players.update({
        account_id: steam32
    }, {
        $set: insert
    }, {
        upsert: true
    }, function(err, num) {
        if(err) return done(err, null)
        return done(null, {
            account_id: steam32
        })
    })
}))
app.use("/public", express.static(path.join(__dirname, '/public')))
app.use(session({
    secret: process.env.SESSION_SECRET
}))
app.use(passport.initialize())
app.use(passport.session()) // persistent login
app.use(function(req, res, next) {
    user = req.user
    next()
})
app.use(function(req, res, next) {
    utility.constants.findOne({}, function(err, doc) {
        app.locals.constants = doc
        next()
    })
})
app.param('match_id', function(req, res, next, id) {
    cache.get(req.url, function(err, reply) {
        if(err || !reply || process.env.NODE_ENV!="production") {
            logger.info("Cache miss for HTML for request " + req.url)
            matches.findOne({
                match_id: Number(id)
            }, function(err, match) {
                if(!match) {
                    return next()
                } else {
                    utility.fillPlayerNames(match.players, function(err) {
                        req.match = match
                        return next()
                    })
                }
            })
        } else if(reply) {
            logger.info("Cache hit for HTML for request " + req.url)
            return res.send(reply);
        } else {
            return next()
        }
    })
})
app.route('/').get(function(req, res) {
    if(req.user) {
        utility.getMatches(req.user.account_id, function(err, docs) {
            res.render('index.jade', {
                match: docs[0]
            })
        })
    } else {
        res.render('index.jade', {})
    }
})
app.route('/matches').get(function(req, res) {
    utility.getMatches(null, function(err, docs) {
        res.render('matches.jade', {
            matches: docs
        })
    })
})
app.route('/matches/:match_id/:info?').get(function(req, res, next) {
    var info = req.params.info || 'index'
    var match = req.match
    if(!matchPages[info]) {
        return next()
    }
    if(info == "graphs") {
        if(match.parsed_data) {
            //compute graphs
            var goldDifference = ['Gold']
            var xpDifference = ['XP']
            for(var i = 0; i < match.parsed_data.times.length; i++) {
                var goldtotal = 0
                var xptotal = 0
                match.parsed_data.players.forEach(function(elem, j) {
                    if(match.players[j].player_slot < 64) {
                        goldtotal += elem.gold[i]
                        xptotal += elem.xp[i]
                    } else {
                        xptotal -= elem.xp[i]
                        goldtotal -= elem.gold[i]
                    }
                })
                goldDifference.push(goldtotal)
                xpDifference.push(xptotal)
            }
            var time = ["time"].concat(match.parsed_data.times)
            data = {
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
        tabs: matchPages
    }, function(err, html) {
        if(err) return next(err)
        if(match.parsed_data) {
            cache.setex(req.url, 86400, html)
        }
        return res.send(html)
    })
})
app.route('/players').get(function(req, res) {
    players.find({}, function(err, docs) {
        res.render('players.jade', {
            players: docs
        })
    })
})
app.route('/players/:account_id/:info?').get(function(req, res, next) {
    var info = req.params.info || 'index';
    if(!playerPages[info]) {
        return next()
    }
    players.findOne({
        account_id: Number(req.params.account_id)
    }, function(err, player) {
        if(!player) {
            return next()
        } else {
            utility.getMatches(player.account_id, function(err, matches) {
                var account_id = player.account_id
                var counts = {}
                var heroes = {}
                player.win = 0
                player.lose = 0
                for(i = 0; i < matches.length; i++) {
                    for(j = 0; j < matches[i].players.length; j++) {
                        var p = matches[i].players[j]
                        if(p.account_id == account_id) {
                            var playerRadiant = utility.isRadiant(p)
                            matches[i].player_win = (playerRadiant == matches[i].radiant_win)
                            matches[i].slot = j
                            matches[i].player_win ? player.win += 1 : player.lose += 1
                            if(!heroes[p.hero_id]) {
                                heroes[p.hero_id] = {}
                                heroes[p.hero_id]["games"] = 0
                                heroes[p.hero_id]["win"] = 0
                                heroes[p.hero_id]["lose"] = 0
                            }
                            heroes[p.hero_id]["games"] += 1
                            if(matches[i].player_win) {
                                heroes[p.hero_id]["win"] += 1
                            } else {
                                heroes[p.hero_id]["lose"] += 1
                            }
                        }
                    }
                    if(info == "teammates") {
                        for(j = 0; j < matches[i].players.length; j++) {
                            var p = matches[i].players[j]
                            if(utility.isRadiant(p) == playerRadiant) { //teammates of player
                                if(!counts[p.account_id]) {
                                    counts[p.account_id] = {}
                                    counts[p.account_id]["account_id"] = p.account_id
                                    counts[p.account_id]["win"] = 0
                                    counts[p.account_id]["lose"] = 0
                                    counts[p.account_id]["games"] = 0
                                }
                                counts[p.account_id]["games"] += 1
                                if(matches[i].player_win) {
                                    counts[p.account_id]["win"] += 1
                                } else {
                                    counts[p.account_id]["lose"] += 1
                                }
                            }
                        }
                    }
                }
                //convert counts to array and filter
                player.teammates = []
                for(var id in counts) {
                    var count = counts[id]
                    if(id != app.locals.constants.anonymous_account_id && id != player.account_id && count.games >= 2) {
                        player.teammates.push(count)
                    }
                }
                player.heroes = heroes
                utility.fillPlayerNames(player.teammates, function(err) {
                    if(info == "index") {
                        data = {}
                        matches.forEach(function(m) {
                            data[m.start_time] = 1
                        })
                    }
                    res.render(playerPages[info].template, {
                        route: info,
                        player: player,
                        matches: matches,
                        tabs: playerPages
                    })
                })
            })
        }
    })
})
app.route('/login').get(passport.authenticate('steam', {
    failureRedirect: '/'
}))
app.route('/return').get(passport.authenticate('steam', {
    failureRedirect: '/'
}), function(req, res) {
    if(req.user) {
        res.redirect('/players/' + req.user.account_id)
    } else {
        res.redirect('/')
    }
})
app.route('/logout').get(function(req, res) {
    req.logout();
    res.redirect('/')
})
app.use(function(err, req, res, next) {
    if(err && process.env.NODE_ENV == "production") {
        return res.status(500).render('500.jade')
    }
    next()
})
// Handle 404
app.use(function(req, res) {
    if(process.env.NODE_ENV == "production") {
        res.status(404).render('404.jade');
    }
});