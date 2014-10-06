var express = require('express'),
    session = require('express-session'),
    utility = require('./utility'),
    matches = utility.matches,
    players = utility.players,
    async = require('async'),
    fs = require('fs'),
    path = require('path'),
    passport = require('passport'),
    SteamStrategy = require('passport-steam').Strategy,
    app = express();
var constants;
var port = Number(process.env.PORT || 5000);
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
app.listen(port, function() {
    console.log("[WEB] listening on port %s", port)
})
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
app.use('/login', function(req, res, next) {
    var host = req.protocol + '://' + req.get('host')
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
    next()
})
app.param('match_id', function(req, res, next, id) {
    matches.findOne({
        match_id: Number(id)
    }, function(err, match) {
        if(!match) {
            res.status(404).render('404', {
                message: "Sorry, we couldn't find this match!"
            })
        } else {
            utility.fillPlayerNames(match.players, function(err) {
                req.match = match
                next()
            })
        }
    })
})
app.use("/public", express.static(path.join(__dirname, '/public')))
app.use(session({
    secret: process.env.COOKIE_SECRET,
    saveUninitialized: true,
    resave: true
}))
app.use(passport.initialize())
app.use(passport.session()) // persistent login
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'jade');
app.locals.moment = require('moment');
loadConstants()
utility.updateConstants(function(err) {
    loadConstants()
})

function loadConstants() {
    utility.constants.findOne({}, function(err, doc) {
        app.locals.constants = doc
    })
}
app.route('/').get(function(req, res) {
    if(req.user) {
        utility.getLastMatch(req.user.account_id, function(err, doc) {
            res.render('index.jade', {
                user: req.user,
                match: doc
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
app.route('/matches/:match_id/:info?').get(function(req, res) {
    var render,
        info = req.params.info
    if(info) {
        if(info in matchPages) {
            render = matchPages[info].template
        } else {
            return res.status(404).render('404.jade')
        }
    } else {
        match = req.match
        match.sums = [{
            personaname: "Radiant"
        }, {
            personaname: "Dire"
        }]
        match.players.forEach(function(player) {
            var target = (player.player_slot < 64 ? match.sums[0] : match.sums[1])
            for(var prop in player) {
                if(typeof(player[prop]) == "number") {
                    if(!(prop in target)) {
                        target[prop] = 0
                    }
                    target[prop] += player[prop]
                }
            }
        })
        render = matchPages['index'].template
    }
    res.render(render, {
        route: info ? info : 'index',
        match: req.match,
        tabs: matchPages
    })
})
app.route('/players').get(function(req, res) {
    utility.getTrackedPlayers(function(err, docs) {
        res.render('players.jade', {
            players: docs
        })
    })
})
app.route('/players/:id').get(function(req, res) {
    players.findOne({
        account_id: Number(req.params.id)
    }, function(err, player) {
        if(!player) res.status(404).send('Could not find this player!')
        else {
            utility.getMatches(player.account_id, function(err, matches) {
                utility.fillPlayerStats(player, matches, function(err, player, matches) {
                    res.render('player.jade', {
                        player: player,
                        matches: matches
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
app.use(function(req, res, next) {
    res.status(404).render('404.jade')
});