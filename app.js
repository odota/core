var express = require('express'),
    utility = require('./utility'),
    matches = utility.matches,
    players = utility.players,
    async = require('async'),
    fs = require('fs'),
    path = require('path'),
    constants = require('./constants.json')
    async.parallel([
        function(cb) {
            utility.getData("https://api.steampowered.com/IEconDOTA2_570/GetHeroes/v0001/?key=" + process.env.STEAM_API_KEY + "&language=en-us", function(err, data) {
                if(!err) {
                    var array = data.result.heroes;
                    var lookup = {}
                    for(var i = 0; i < array.length; i++) {
                        lookup[array[i].id] = array[i];
                    }
                    console.log("[UPDATE] updating heroes")
                    constants.heroes = lookup;
                }
                cb()
            })
        },
        function(cb) {
            utility.getData("http://www.dota2.com/jsfeed/itemdata", function(err, data) {
                if(!err) {
                    var objects = data.itemdata;
                    var lookup = {}
                    for(var key in objects) {
                        lookup[objects[key].id] = objects[key];
                    }
                    console.log("[UPDATE] updating items")
                    constants.items = lookup;
                }
                cb()
            })
        },
        function(cb) {
            utility.getData("https://raw.githubusercontent.com/kronusme/dota2-api/master/data/mods.json", function(err, data) {
                if(!err) {
                    var array = data.mods;
                    var lookup = {}
                    for(var i = 0; i < array.length; i++) {
                        lookup[array[i].id] = array[i].name;
                    }
                    console.log("[UPDATE] updating gamemodes")
                    constants.gameModes = lookup;
                }
                cb()
            })
        },
        function(cb) {
            utility.getData("https://raw.githubusercontent.com/kronusme/dota2-api/master/data/regions.json", function(err, data) {
                if(!err) {
                    var array = data.regions;
                    var lookup = {}
                    for(var i = 0; i < array.length; i++) {
                        lookup[array[i].id] = array[i].name;
                    }
                    console.log("[UPDATE] updating regions")
                    constants.regions = lookup;
                }
                cb()
            })
        }
    ], function() {
        console.log("[UPDATE] writing constants file")
        fs.writeFileSync("./constants.json", JSON.stringify(constants, null, 4))
        var app = express()
        app.use("/public", express.static(path.join(__dirname, '/public')))
        app.set('views', path.join(__dirname, 'views'))
        app.set('view engine', 'jade');
        app.locals.moment = require('moment')
        app.locals.constants = constants;
        app.route('/').get(function(req, res) {
            res.render('index.jade', {})
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
                    utility.fillPlayerNames(doc.players, function(err, players) {
                        doc.players = players
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
            }, function(err, doc) {
                if(!doc) res.status(404).send('Could not find this player!')
                else {
                    utility.getMatches(doc.account_id, function(err, matches) {
                        utility.fillTeammates(doc, function(err, doc) {
                            res.render('player.jade', {
                                player: doc,
                                matches: matches
                            })
                        })
                    })
                }
            })
        })
        var port = Number(process.env.PORT || 5000);
        app.listen(port, function() {
            console.log("Listening on " + port);
        })
    })