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
    constants = require('./constants.json')

passport.use(new SteamStrategy({
    //todo get actual address of running instance
    returnURL:  process.env.HOST + '/return',
    realm: process.env.HOST,
    apiKey: process.env.STEAM_API_KEY
}, function(identifier, profile, done) { // start tracking the player
    steam32 = Number(utility.convert64to32(identifier.substr(identifier.lastIndexOf("/") + 1)))

    players.findOne({
            account_id: steam32    
    }, function(err, player) {
        if (err) return done(err, null)
        if (player) {
            players.update({
                account_id: steam32
            }, {
                $set: profile._json
            }, {
                upsert: true
            }, function(err, player) {
                if(err) return done(err, null)
                
                return done(null, steam32)
            })
        } else { //new user!
            var insert = profile._json
            insert.account_id = steam32
            insert.track = 1
            players.insert(insert, function(err, doc){
                if (err) return done(err, null)

                return done(null, {steamid: steam32, new: 1});
            })
        }
    })
}))

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(id, done) {
    done(null, id)
});

var app = express()
app.use("/public", express.static(path.join(__dirname, '/public')))
app.use(session({
    secret: process.env.COOKIE_SECRET
}))
app.use(passport.initialize())
app.use(passport.session()) // persistent login
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'jade');
app.locals.numeral = require('numeral')
app.locals.moment = require('moment')
app.locals.constants = constants;
app.route('/').get(function(req, res) {
    res.render('index.jade', {
        loggedin: req.user
    })
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
        "match_id": Number(req.params.id)
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
    failureRedirect: '/',
    successRedirect: '/'
}))

app.route('/logout').get(function(req, res) {
    req.logout();
    res.redirect('/')
})

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
    console.log("Listening on " + port);
})