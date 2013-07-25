var express = require('express'),
    http = require('http'),
    path = require('path'),
    steam = require("steam"),
    util = require("util"),
    fs = require("fs"),
    dota2 = require("dota2"),
    bot = new steam.SteamClient(),
    Dota2 = new dota2.Dota2Client(bot, true),
    deferred = require("deferred"),
    dota_ready = false,
    matchid_deffereds = {};

var app = express(),
    config = require("./config"),
    _cwd = config.cwd;

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

app.get('/tools/matchurls', function(req, res){
    if (!dota_ready) {
        res.render('notready', { title: 'match urls!' });
    }
    else {
        if (req.query.matchid) {
            if (!matchid_deffereds[req.query.matchid]) {
                matchid_deffereds[req.query.matchid] = new deferred();
                matchid_deffereds[req.query.matchid].pms = matchid_deffereds[req.query.matchid].promise();
                Dota2.matchDetailsRequest(req.query.matchid);
            }

            matchid_deffereds[req.query.matchid].pms.then(function(data){
                res.render('index', {
                    title: 'match urls!',
                    matchid: req.query.matchid,
                    matchurl: util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.match.cluster, data.match.matchId, data.match.replaySalt)
                });
            });
            setTimeout(function(){
                delete matchid_deffereds[req.query.matchid];
            }, 1000 * 120);

            setTimeout(function(){
                res.render('index', {
                    title: 'match urls!',
                    error: true
                });
            }, config.request_timeout);
        }
        else {
            res.render('index', { title: 'match urls!' });
        }
    }
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

global.config = require("./config");

/* Steam logic */
var onSteamLogOn = function onSteamLogOn(){
        bot.setPersonaState(steam.EPersonaState.Busy); // to display your bot's status as "Online"
        bot.setPersonaName(config.steam_name); // to change its nickname
        util.log("Logged on.");

        Dota2.launch();
        Dota2.on("ready", function() {
        util.log("Dotto ready");
            dota_ready = true;
        });

        Dota2.on("matchData", function (matchId, matchData) {
            if (!matchid_deffereds[matchId]) return;
            matchid_deffereds[matchId].resolve(matchData);
        });

        Dota2.on("unhandled", function(kMsg) {
            util.log("UNHANDLED MESSAGE " + kMsg);
        });
    },
    onSteamSentry = function onSteamSentry(sentry) {
        util.log("Received sentry.");
        require('fs').writeFileSync(_cwd + 'sentry', sentry);
    },
    onSteamServers = function onSteamServers(servers) {
        util.log("Received servers.");
        fs.writeFile(_cwd + 'servers', JSON.stringify(servers));
    };

bot.logOn({
    "accountName": config.steam_user,
    "password": config.steam_pass,
    "authCode": config.steam_guard_code,
    "shaSentryfile": fs.readFileSync(_cwd + 'sentry')
});
bot.on("loggedOn", onSteamLogOn)
    .on('sentry', onSteamSentry)
    .on('servers', onSteamServers);