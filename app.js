var express = require('express'),
    path = require('path'),
    async = require('async'),
    util = require('./util'),
    app = express(),
    request = require('request'),
    constants = require('./constants');

//initialize hero and item constants
request("https://api.steampowered.com/IEconDOTA2_570/GetHeroes/v0001/?key="+process.env.STEAM_API_KEY+"&language=en-us", function (error, response, body) {
    if (!error && response.statusCode == 200) {
        var array = JSON.parse(body).result;
        var lookup={}
        for (var i = 0, len = array.length; i < len; i++) {
            lookup[array[i].id] = array[i];
        }
        console.log("getting heroes");
        constants.heroes = lookup;
    }
})
request("http://www.dota2.com/jsfeed/itemdata", function (error, response, body) {
    if (!error && response.statusCode == 200) {
        var objects = JSON.parse(body).itemdata;
        var lookup={}
        for(var key in objects) {
            lookup[objects[key].id] = objects[key];
        }
        console.log("getting items");
        constants.items = lookup;
    }
})

//start getting matches
var MatchService = require('./MatchService');
MatchService()

app.use("/public", express.static(path.join(__dirname, '/public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'jade');
app.locals.moment = require('moment')
app.locals.constants = constants;

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

app.route('/todo').get(function(req, res){
    res.render(
        'todo.jade'
    )
})

app.route('/matches/:id').get(function(req, res){
    util.getMatch(+req.params.id).success(function(doc){
        if (!doc) res.status(404).send('Could not find this match!')
        else {
            console.log(doc.players)
            res.render('match.jade',{match: doc})
        }
    })
})

app.route('/players/:player_id').get(function(req, res) { 
    var teammates = require('./teammates');
    teammates.getCounts(req.params.player_id, req.query.update, function(result){        
        res.send(result);
    });
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
    console.log("Listening on " + port);
});
