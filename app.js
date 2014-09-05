var express = require('express'),
    async = require('async'),
    path = require('path'),
    util = require('./util'),
    app = express(),
    request = require('request'),
    constants = require("./constants.json");

//update constants
async.series([util.updateHeroes, util.updateItems, util.writeConstants])

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
            res.render('match.jade',{match: doc, playerInfo: util.extractPlayerInfo(doc)})
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
