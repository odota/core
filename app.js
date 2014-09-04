var express = require('express'),
    path = require('path'),
    async = require('async'),
    morgan = require('morgan'),
    matchService = require('./MatchService'),
    util = require('./util'),
    fs = require('fs');
    
var app = express(),
    modes = {
        "0": "None",
        "1": "All Pick",
        "2": "Captain's Mode",
        "3": "Random Draft",
        "4": "Single Draft",
        "5": "All Random",
        "6": "Intro",
        "7": "Diretide",
        "8": "Reverse Captain's Mode",
        "9": "The Greeviling",
        "10": "Tutorial",
        "11": "Mid Only",
        "12": "Least Played",
        "13": "New Player Pool",
        "14": "Compendium Matchmaking",
        "16": "Captain's Draft"   
    },
    accessLogStream = fs.createWriteStream(__dirname + '/access.log', {flags: 'a'})

matchService()

app.use("/public", express.static(path.join(__dirname, '/public')))
app.use(morgan('combined', {stream: accessLogStream}))
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.moment = require('moment')

app.route('/').get(function(req, res){
    util.getAllMatches().success(function(doc){
        res.render(
            'index.jade',
            {
                title: 'Stats',
                matches: doc
            }
        )
    })
})

app.route('/matches/:id').get(function(req, res){
    util.getMatch(+req.params.id).success(function(doc){
        if (!doc) res.status(404).send('Could not find this match!')
        else {
            async.map(doc.players, util.getPlayerInfo, function(err, results){
                if (!err) {
                    res.render(
                        'match.jade',
                        {
                            match: doc,
                            mode: modes[doc.game_mode],
                            playerInfo: results
                        }
                    )     
                } else {
                    res.status(500).send('Something bad happened when trying to get match info.')    
                }
            })   
        }
    })
})

var server = app.listen(3000, function() {
    console.log('Listening on port %d', server.address().port)
})