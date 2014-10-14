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
    redis = require('redis'),
    app = express();
var redisClient = redis.createClient();
var port = Number(process.env.PORT || 3000);
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
app.use(function(req, res, next) {
    utility.constants.findOne({}, function(err, doc) {
        app.locals.constants = doc
        next()
    })
})
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
app.use("/public", express.static(path.join(__dirname, '/public')))
app.use(session({
    secret: process.env.SESSION_SECRET || "secret",
    saveUninitialized: true,
    resave: true
}))
app.use(passport.initialize())
app.use(passport.session()) // persistent login
app.param('match_id', function(req, res, next, id) {
    matches.findOne({
        match_id: Number(id)
    }, function(err, match) {
        if(!match) {
            return next()
        } else {
            utility.fillPlayerNames(match.players, function(err) {
                req.match = match
                next()
            })
        }
    })
})
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'jade');
app.locals.moment = require('moment');
app.locals.production = process.env.NODE_ENV || 0;
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
app.route('/matches/:match_id/:info?').get(function(req, res, next) {
    var info = req.params.info ? req.params.info : 'index',
        match = req.match
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
    if (!matchPages[info]){
        return next()
    }
    res.render(matchPages[info].template, {
        route: info,
        match: req.match,
        tabs: matchPages
    })
})
app.route('/players').get(function(req, res) {
    players.find({}, function(err, docs) {
        res.render('players.jade', {
            players: docs
        })
    })
})
app.route('/players/:id').get(function(req, res, next) {
    players.findOne({
        account_id: Number(req.params.id)
    }, function(err, player) {
        if(!player) {
            return next()
        } else {
            utility.getMatches(player.account_id, function(err, matches) {
                utility.fillPlayerStats(player, matches, function(err, player, matches) {
                    data={}
                    matches.forEach(function(m){
                        data[m.start_time]=1
                    })
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
// Handle 404
app.use(function(req, res) {
    res.status(404).render('404.jade');
});