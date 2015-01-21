var steam = require("steam"),
    dota2 = require("dota2"),
    Steam = new steam.SteamClient(),
    Dota2 = new dota2.Dota2Client(Steam, false),
    fs = require('fs');
var users = process.env.STEAM_USER.split(",");
var passes = process.env.STEAM_PASS.split(",");
var codes = process.env.STEAM_GUARD_CODE.split(",");
var loginNum = Math.floor((Math.random() * users.length));
var express = require('express');
var app = express();
var lock = false;
var ready = false;
var counts = {};
for (var i = 0; i < users.length; i++) {
    counts[i] = {
        attempts: 0,
        success: 0
    };
}
app.get('/', function(req, res) {
    if (!req.query.match_id) {
        return res.json({
            loginNum: loginNum,
            counts: counts
        });
    }
    getGCReplayUrl(req.query.match_id, function(err, data) {
        if (!err) {
            res.json(data);
        }
        else {
            var response = {
                error: err
            };
            console.log(response);
            res.status(500).json(response);
        }
    });
});

function logOnSteam() {
    if (lock) {
        //console.log("locked");
        return;
    }
    lock = true;
    loginNum += 1;
    loginNum = loginNum % users.length;
    var user = users[loginNum];
    var pass = passes[loginNum];
    var authcode = codes[loginNum];
    var logOnDetails = {
        "accountName": user,
        "password": pass
    };
    if (authcode) logOnDetails.authCode = authcode;
    if (!fs.existsSync("sentry")) {
        fs.openSync("sentry", 'w');
    }
    var sentry = fs.readFileSync("sentry");
    if (sentry.length) logOnDetails.shaSentryfile = sentry;
    Steam.logOn(logOnDetails);
    console.log("[STEAM] Trying to log on with %s,%s", user, pass);
    var onSteamLogOn = function onSteamLogOn() {
            console.log("[STEAM] Logged on %s", Steam.steamID);
            Dota2.launch();
            Dota2.on("ready", function() {
                ready = true;
            });
        },
        onSteamSentry = function onSteamSentry(newSentry) {
            console.log("[STEAM] Received sentry.");
            fs.writeFileSync("sentry", newSentry);
        },
        onSteamServers = function onSteamServers(servers) {
            console.log("[STEAM] Received servers.");
            fs.writeFile("servers", JSON.stringify(servers));
        },
        onSteamError = function onSteamError(e) {
            ready = false;
            console.log(e);
        };
    Steam.on("loggedOn", onSteamLogOn).on('sentry', onSteamSentry).on('servers', onSteamServers).on('error', onSteamError);
}

function getGCReplayUrl(match_id, cb) {
    if (!ready) {
        logOnSteam();
        cb("dota2 not ready");
    }
    else {
        console.log("[DOTA] requesting replay %s, loginNum: %s, numusers: %s", match_id, loginNum, users.length);
        var timeOut = setTimeout(function() {
            console.log("[DOTA] request for replay timed out");
            reset();
            cb("timeout");
        }, 10000);
        counts[loginNum].attempts += 1;
        Dota2.matchDetailsRequest(match_id, function(err, data) {
            clearTimeout(timeOut);
            counts[loginNum].success += 1;
            cb(err, data);
        });
    }
}

function reset() {
    Dota2.exit();
    Steam.logOff();
    Steam = new steam.SteamClient();
    Dota2 = new dota2.Dota2Client(Steam, false);
    ready = false;
    lock = false;
}

setTimeout(function() {
    process.exit(0);
}, 1000 * 60 * 60);

var server = app.listen(process.env.PORT || 3000, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[WEB] listening at http://%s:%s', host, port);
});