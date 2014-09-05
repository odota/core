var express = require('express'),
    db = require('monk')(process.env.MONGOHQ_URL),
    path = require('path'),
    async = require('async'),
    matchService = require('./MatchService'),
    util = require('./util'),
	teammates = require('./teammates')

var app = express()

matchService()

app.use("/public", express.static(path.join(__dirname, '/public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'jade');
app.locals.moment = require('moment')
app.locals.gameModes = require('./constants').gameModes

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
            async.map(doc.players, util.getPlayerInfo, function(err, results){
                if (!err) {
                    res.render(
                        'match.jade',
                        {
                            match: doc,
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

app.route('/players/:player_id').get(function(req, res) { 
    teammates.getCounts(req.params.player_id, req.query.update, function(result){        
        res.send(result);
    });
});

var server = app.listen(3000, function() {
    console.log('Listening on port %d', server.address().port)
})
