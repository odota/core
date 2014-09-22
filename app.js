var express = require('express'),
    utility = require('./utility'),
    matches = utility.matches,
    players = utility.players,
    async = require('async'),
    fs = require('fs'),
    path = require('path'),
    constants = require('./constants.json')
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
                if (doc.parsed_data){
                    doc.parsed_data.players.forEach(function(player, i){
                        player.hero=constants.heroes[doc.players[i].hero_id]
                        player.build=doc.parsed_data.itembuilds.filter( function( item, index, inputArray ) {
                            var hero_id = constants.heroes[item.hero].id
                            return player.hero_list.indexOf(hero_id);
                        });
                        player.itemuses={}
                        player.purchases={}
                        player.kills={}
                        //todo cross table of kills
                        //todo ARDM hero timeline
                        var heroIDs = player.hero_list.filter( function( item, index, inputArray ) {
                            return inputArray.indexOf(item) == index;
                        });
                        //todo druid edge case
                        for (var i =0; i<heroIDs.length;i++){
                            if (heroIDs[i]>=0){
                                utility.merge(player.purchases, doc.parsed_data.purchases[constants.heroes[heroIDs[i]].name])
                                utility.merge(player.itemuses, doc.parsed_data.itemuses[constants.heroes[heroIDs[i]].name])
                                utility.merge(player.kills, doc.parsed_data.kills[constants.heroes[heroIDs[i]].name])                
                            }
                        }
                    })
                }
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
var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
    console.log("Listening on " + port);
})
