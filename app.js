var express = require('express'),
    utility = require('./utility'),
    players = utility.players,
    async = require('async'),
    fs = require('fs'),
    path = require('path')

function updateConstants(cb){
    var constants = require('./constants.json')
    async.parallel([
        function (cb){
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
        function (cb){
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
        },
        function (cb){
            utility.getData("https://raw.githubusercontent.com/kronusme/dota2-api/master/data/mods.json", function (err, data) {
                if (!err){
                    var array = data.mods;
                    var lookup={}
                    for (var i = 0; i < array.length;i++) {
                        lookup[array[i].id] = array[i].name;
                    }
                    constants.gameModes=lookup;
                }
                cb()
            })
        },
        function (cb){
            utility.getData("https://raw.githubusercontent.com/kronusme/dota2-api/master/data/regions.json", function (err, data) {
                if (!err){
                    var array = data.regions;
                    var lookup={}
                    for (var i = 0; i < array.length;i++) {
                        lookup[array[i].id] = array[i].name;
                    }
                    constants.regions=lookup;
                }
                cb()
            })
        }
    ], 
                   function(){
        fs.writeFileSync("./constants.json", JSON.stringify(constants, null, 4))   
        cb(constants)
    })
}

updateConstants(function(constants){
    var app = express()
    app.use("/public", express.static(path.join(__dirname, '/public')))
    app.set('views', path.join(__dirname, 'views'))
    app.set('view engine', 'jade');
    app.locals.moment = require('moment')
    app.locals.constants = constants;

    app.route('/').get(function(req, res){
        utility.getAllMatches().success(function(doc){
            res.render('index.jade',{matches: doc})
        })
    })

    app.route('/matches/:id').get(function(req, res){
        utility.getMatch(Number(req.params.id)).success(function(doc){
            if (!doc) res.status(404).send('Could not find this match!')
            else {
                utility.updateDisplayNames(doc, function(err){
                    if (!doc.playerNames){
                        doc.playerNames=[]
                        async.mapSeries(doc.players, function(player, cb){
                            players.findOne({account_id:player.account_id}, function(err, dbPlayer){
                                if (dbPlayer){
                                    doc.playerNames.push(dbPlayer.display_name)
                                }
                                else{
                                    doc.playerNames.push("Anonymous")
                                }
                                cb(null)
                            })
                        }, function(err){
                            res.render('match.jade',{match: doc})
                        })
                    }
                    else{
                        res.render('match.jade',{match: doc})
                    }
                })
            }
        })
    })

    app.route('/players/:id').get(function(req, res) { 
        players.findOne({account_id: Number(req.params.id)}, function(err, doc){
            if (!doc) res.status(404).send('Could not find this player!')
            else{
                utility.getCounts(doc.account_id, true, function(counts){
                    res.render('player.jade', {player: doc, counts: counts})
                })
            }
        })
    })

    var port = Number(process.env.PORT || 5000);
    app.listen(port, function() {
        console.log("Listening on " + port);
    })
})

