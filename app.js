var express = require('express'),
    utility = require('./utility'),
    players = utility.players,
    async = require('async'),
    fs = require('fs'),
    teammates = require('./teammates'),
    path = require('path')

function updateConstants(cb){
    var constants = require('./constants.json')
    async.parallel({
        "heroes":function (cb){
            utility.getData("https://api.steampowered.com/IEconDOTA2_570/GetHeroes/v0001/?key="+process.env.STEAM_API_KEY+"&language=en-us", function (err, data) {
                if (!err){
                    var array = data.result.heroes;
                    var lookup={}
                    for (var i = 0; i < array.length;i++) {
                        lookup[array[i].id] = array[i];
                    }
                    constants.heroes=lookup;
                }
                cb()
            })
        }, 
        "items":function (cb){
            utility.getData("http://www.dota2.com/jsfeed/itemdata", function (err, data) {
                if (!err){
                    var objects = data.itemdata;
                    var lookup={}
                    for(var key in objects) {
                        lookup[objects[key].id] = objects[key];
                    }
                    constants.items=lookup;
                }
                cb()
            })
        }
    }, function(){
        console.log("[UPDATE] rewriting constants file")
        fs.writeFileSync("./constants.json", JSON.stringify(constants, null, 4))   
        cb(constants)
    })
}

updateConstants(function(constants){
    var app = express();
    app.use("/public", express.static(path.join(__dirname, '/public')))
    app.set('views', path.join(__dirname, 'views'))
    app.set('view engine', 'jade');
    app.locals.moment = require('moment')
    app.locals.constants = constants;

    app.route('/').get(function(req, res){
        utility.getAllMatches().success(function(doc){
            res.render(
                'index.jade',
                {
                    matches: doc
                }
            )
        })
    })

    app.route('/matches/:id').get(function(req, res){
        utility.getMatch(+req.params.id).success(function(doc){
            if (!doc) res.status(404).send('Could not find this match!')
            else {
                res.render('match.jade',{match: doc})
            }
        })
    })

    app.route('/players/:player_id').get(function(req, res) { 
        teammates.getCounts(req.params.player_id, req.query.update, function(result){        
            res.send(result);
        });
    });

    app.route('/signup/').get(function(req,res){
        players.insert({player_id:req.query.player_id})
        res.redirect('/')
    })

    var port = Number(process.env.PORT || 5000);
    app.listen(port, function() {
        console.log("Listening on " + port);
    })             
})

