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
var port = Number(process.env.PORT || 5000)
app.listen(port)
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
app.locals.moment = require('moment')
utility.constants.findOne({}, function(err, doc){
    app.locals.constants = doc
})
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
app.route('/matches/:id').get(function(req, res) {
    matches.findOne({
        match_id: Number(req.params.id)
    }, function(err, doc) {
        if(!doc) res.status(404).send('Could not find this match!')
        else {
            utility.fillPlayerNames(doc.players, function(err) {
                res.render('match.jade', {
                    match: doc
                })
            })
        }
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
    if(req.user) res.redirect('/players/' + req.user.account_id)
    res.redirect('/')
})
app.route('/logout').get(function(req, res) {
    req.logout();
    res.redirect('/')
})
