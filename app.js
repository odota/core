var express = require('express'),
    http = require('http'),
    path = require('path'),
    util = require("util"),
    Steam = require("./MatchProvider-steam").MatchProvider,
    MongoDB = require("./MatchProvider-mongodb").MatchProvider,
    config = require("./config");

var app = express(),
    steam = new Steam(
        config.steam_user,
        config.steam_pass,
        config.steam_name,
        config.steam_guard_code,
        config.cwd,
        config.steam_response_timeout),
    mongodb = new MongoDB(config.mongodb_host, config.mongodb_port);

// all environments
app.set('port', 3100);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
// if ('development' == app.get('env')) {
//   app.use(express.errorHandler());
// }

app.get('/', function(req, res){
    res.redirect("/tools/matchurls");
});

app.get('/tools/matchurls', function(req, res){
    var matchId = req.query.matchid;
    if (!matchId) {
        // No match ID, display regular index.
        res.render('index', { title: 'match urls!' });
        res.end();
    }
    else {
        if (!isNaN(matchId) && parseInt(matchId, 10) < 1024000000000) {
            matchId = parseInt(matchId, 10);

            mongodb.findByMatchId(matchId, function(err, data) {
                if (err) throw err;

                if (data) {
                    // We have this appid data already in mongodb, so just serve from there.
                    res.render('index', {
                        title: 'match urls!',
                        matchid: matchId,
                        replayState: data.state,
                        replayUrl: util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt)
                    });
                    res.end();
                }
                else if (steam.ready) {
                    // We need new data from Dota.
                    steam.getMatchDetails(matchId, function(err, data) {
                        if (err) throw err;

                        // Save the new data to Mongo
                        mongodb.save(data, function(err, cb){});

                        res.render('index', {
                            title: 'match urls!',
                            matchid: matchId,
                            replayState: data.state,
                            replayUrl: util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt)
                        });
                        res.end();
                    });

                    // If Dota hasn't responded by 'request_timeout' then send a timeout page.
                    setTimeout(function(){
                        res.render('index', {
                            title: 'match urls!',
                            error: "timeout"
                        });
                        res.end();
                    }, config.request_timeout);
                }
                else {
                    // We need new data from Dota, and Dota is not ready.
                    res.render('index', {
                        title: 'match urls!',
                        error: "notready"
                    });
                    res.end();
                }
            });
        }
        else {
            // Match ID failed validation.
            res.render('index', {
                title: 'match urls!',
                error: "invalid"
            });
            res.end();
        }
    }
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});