var express = require('express');
var session = require('cookie-session');
var utility = require('./utility'),
    kue = utility.kue,
    auth = require('http-auth'),
    ui = require('kue-ui'),
    matches = utility.matches,
    players = utility.players,
    async = require('async'),
    fs = require('fs'),
    path = require('path'),
    winston = require('winston'),
    passport = require('passport'),
    cache = utility.redis,
    SteamStrategy = require('passport-steam').Strategy,
    app = express(),
    Poet = require('poet');
    
var poet = Poet(app, {
  posts: './_posts/',
  postsPerPage: 5,
  metaFormat: 'json'
});

poet.init().then(function () {
  // ready to go!
});

var host = process.env.ROOT_URL
var port = Number(process.env.PORT || 3000);
var transports = []
if (process.env.NODE_ENV === "production") {
    transports.push(new(winston.transports.File)({
        filename: 'app.log',
        level: 'info'
    }))
}
else {
    transports.push(new(winston.transports.Console)())
}
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
}
var playerPages = {
    index: {
        template: "player_index",
        name: "Player"
    },
    matches: {
        template: "player_matches",
        name: "Matches"
    }
}
utility.constants.findOne({}, function(err, doc) {
    app.locals.constants = doc
})
app.listen(port, function() {
    logger.info("[WEB] listening on port %s", port)
})
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'jade');
app.locals.moment = require('moment');
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
    var steam32 = Number(utility.convert64to32(identifier.substr(identifier.lastIndexOf("/") + 1)));
    var insert = profile._json
    insert.account_id = steam32;
    insert.track = 1;
    players.update({
        account_id: steam32
    }, {
        $set: insert
    }, {
        upsert: true
    }, function(err, num) {
        if (err) return done(err, null)
        return done(null, {
            account_id: steam32
        })
    })
}))
var basic = auth.basic({
    realm: "Kue"
}, function(username, password, callback) { // Custom authentication method.
    callback(username === process.env.KUE_USER && password === process.env.KUE_PASS);
});
ui.setup({
    apiURL: '/kue' // IMPORTANT: specify the api url
});
//app.use("/kueapi", auth.connect(basic));
app.use("/kue", kue.app);
app.use('/kueui', ui.app);
app.use("/public", express.static(path.join(__dirname, '/public')))
app.use(session({
    maxAge: 1000 * 60 * 60 * 24 * 14, //2 weeks in ms
    secret: process.env.SESSION_SECRET
}))
app.use(passport.initialize())
app.use(passport.session()) // persistent login
app.use(function(req, res, next) {
    app.locals.user = req.user
    next()
})
app.param('match_id', function(req, res, next, id) {
    cache.get(id, function(err, reply) {
        if (err || !reply) {
            logger.info("Cache miss for match " + id)
            matches.findOne({
                match_id: Number(id)
            }, function(err, match) {
                if(err || !match) {
                    return next()
                } else {
                    utility.fillPlayerNames(match.players, function(err) {
                        req.match = match
                        //Add to cache if we have parsed data
                        if (match.parsed_data && process.env.NODE_ENV !== "production") {
                            cache.set(id, JSON.stringify(match))    
                        }
                        return next()
                    })
                }
            })
        } else if (reply) {
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
        if (err) return next(err)
        if (match.parsed_data) {
            cache.setex(req.url, 86400, html)
        }
        return res.send(html)
    })
})
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
                            matches[i].player_win = (playerRadiant === matches[i].radiant_win)
                            matches[i].slot = j
                            matches[i].player_win ? player.win += 1 : player.lose += 1
                            player.games += 1
                            if (!heroes[p.hero_id]) {
                                heroes[p.hero_id] = {}
                                heroes[p.hero_id]["games"] = 0
                                heroes[p.hero_id]["win"] = 0
                                heroes[p.hero_id]["lose"] = 0
                            }
                            heroes[p.hero_id]["games"] += 1
                            if (matches[i].player_win) {
                                heroes[p.hero_id]["win"] += 1
                            }
                            else {
                                heroes[p.hero_id]["lose"] += 1
                            }
                        }
                    }
                    //compute top teammates
                    for (j = 0; j < matches[i].players.length; j++) {
                        p = matches[i].players[j]
                        if (utility.isRadiant(p) === playerRadiant) { //teammates of player
                            if (!counts[p.account_id]) {
                                counts[p.account_id] = {
                                    account_id: p.account_id,
                                    win: 0,
                                    lose: 0,
                                    games: 0
                                };
                            }
                            counts[p.account_id]["games"] += 1
                            matches[i].player_win ? counts[p.account_id]["win"] += 1 : counts[p.account_id]["lose"] += 1
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
    if (req.user) {
        res.redirect('/players/' + req.user.account_id)
    }
    else {
        res.redirect('/')
    }
})
app.route('/logout').get(function(req, res) {
    req.logout();
    req.session = null;
    res.redirect('/')
})
app.use(function(err, req, res, next) {
    if (err && process.env.NODE_ENV === "production") {
        return res.status(500).render('500.jade', {
            error: true
        });
    }
    else {
        return next(err);
    }
})
app.use(function(req, res) {
    if (process.env.NODE_ENV === "production") {
        return res.status(404).render('404.jade', {
            error: true
        });
    }
});
