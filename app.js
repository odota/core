var express = require('express'),
    request = require('request'),
    async = require('async'),
    fs = require('fs');

async.parallel({
    "heroes":function (cb){
        request("https://api.steampowered.com/IEconDOTA2_570/GetHeroes/v0001/?key="+process.env.STEAM_API_KEY+"&language=en-us", function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log("[CONSTANTS] got latest hero data")
                var array = JSON.parse(body).result.heroes;
                var lookup={}
                for (var i = 0; i < array.length;i++) {
                    lookup[array[i].id] = array[i];
                }
                cb(null, lookup)
            }
            else{
                cb(error)
            }
        })
    }, 
    "items":function (cb){
        request("http://www.dota2.com/jsfeed/itemdata", function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log("[CONSTANTS] got latest item data")
                var objects = JSON.parse(body).itemdata;
                var lookup={}
                for(var key in objects) {
                    lookup[objects[key].id] = objects[key];
                }
                cb(null, lookup)
            }
            else{
                cb(error)
            }
        })
    }
}, function(err, results){
    if (err){
        console.log(err)
    }
    else{
        var constants = require('./constants.json');
        constants.heroes = results.heroes;
        constants.items = results.items;
        console.log("[CONSTANTS] writing constants file")
        fs.writeFileSync("./constants.json", JSON.stringify(constants, null, 4));
    }

    var path = require('path'),
        util = require('./util'),
        teammates = require('./teammates'),
        constants = require("./constants.json"),
        app = express();

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
                res.render('match.jade',{match: doc})
            }
        })
    })

    app.route('/players/:player_id').get(function(req, res) { 
        teammates.getCounts(req.params.player_id, req.query.update, function(result){        
            res.send(result);
        });
    });

    var port = Number(process.env.PORT || 5000);
    app.listen(port, function() {
        console.log("Listening on " + port);
    });
})