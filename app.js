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
                    doc.parsed_data.edges=[]
                    doc.parsed_data.players.forEach(function(player, i){
                        //grab final hero from corresponding api data
                        var hero = doc.players[i].hero_id
                        player.hero=constants.heroes[hero]
                        player.id=i
                        player.value=doc.players[i].kills
                        player.label=player.hero.localized_name
                        player.content=player.hero.localized_name
                        player.tp=0
                        player.observer=0
                        player.sentry=0
                        player.smoke=0
                        player.dust=0
                        player.gem=0
                        player.tp_used=0
                        player.observer_used=0
                        player.sentry_used=0
                        player.smoke_used=0
                        player.dust_used=0
                        //todo create a "feed" directed graph
                        //todo ARDM hero timeline
                        //todo timeline of item build
                    })
                    var purchases = doc.parsed_data.purchases
                    for (var i =0;i<purchases.length;i++){
                        var hero_id = constants.heroes[purchases[i].hero].id
                        var slot = doc.parsed_data.hero_to_slot[hero_id]
                        purchases[i].group = slot
                        purchases[i].content=purchases[i].item
                        purchases[i].id=i
                        purchases[i].start=purchases[i].start*1000
                        purchases[i].type="point"
                        if (purchases[i].item=="item_tpscroll"){
                            doc.parsed_data.players[slot].tp+=1
                        }
                        if (purchases[i].item=="item_ward_observer"){
                            doc.parsed_data.players[slot].observer+=2
                        }
                        if (purchases[i].item=="item_ward_sentry"){
                            doc.parsed_data.players[slot].sentry+=2
                        }
                        if (purchases[i].item=="item_smoke_of_deceit"){
                            doc.parsed_data.players[slot].smoke+=1
                        }
                        if (purchases[i].item=="item_dust"){
                            doc.parsed_data.players[slot].dust+=2
                        }
                        if (purchases[i].item=="item_gem"){
                            doc.parsed_data.players[slot].gem+=1
                        }
                    }
                    var uses = doc.parsed_data.itemuses
                    for (var i =0;i<uses.length;i++){
                        var hero_id = constants.heroes[uses[i].hero].id
                        var slot = doc.parsed_data.hero_to_slot[hero_id]
                        uses[i].group = slot
                        if (uses[i].item=="item_tpscroll"){
                            doc.parsed_data.players[slot].tp_used+=1
                        }
                        if (uses[i].item=="item_ward_observer"){
                            doc.parsed_data.players[slot].observer_used+=1
                        }
                        if (uses[i].item=="item_ward_sentry"){
                            doc.parsed_data.players[slot].sentry_used+=1
                        }
                        if (uses[i].item=="item_smoke_of_deceit"){
                            doc.parsed_data.players[slot].smoke_used+=1
                        }
                        if (uses[i].item=="item_dust"){
                            doc.parsed_data.players[slot].dust_used+=1
                        }
                    }
                    var kills = doc.parsed_data.kills
                    for (var i =0;i<kills.length;i++){
                        var hero_id = constants.heroes[kills[i].hero].id
                        var slot = doc.parsed_data.hero_to_slot[hero_id]
                        var target_id = constants.heroes[kills[i].target].id
                        var target_slot = doc.parsed_data.hero_to_slot[target_id]
                        doc.parsed_data.edges.push({from: target_slot, to: slot})
                    }

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
