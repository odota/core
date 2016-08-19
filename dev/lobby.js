var config = require('./config');
var Steam = require("steam");
var Dota2 = require("dota2");
var utility = require("./utility");
var async = require('async');
var convert64To32 = utility.convert64to32;
var express = require('express');
var app = express();
var users = config.STEAM_USER.split(",");
var passes = config.STEAM_PASS.split(",");
var steamObj = {};
var accountToIdx = {};
var replayRequests = 0;
var launch = new Date();
var launched = false;
var a = [];
var port = config.PORT || config.RETRIEVER_PORT;
//create array of numbers from 0 to n
var count = 0;
while (a.length < users.length) a.push(a.length + 0);
async.each(a, function(i, cb) {
    var dotaReady = false;
    var relationshipReady = false;
    var client = new Steam.SteamClient();
    client.steamUser = new Steam.SteamUser(client);
    client.steamFriends = new Steam.SteamFriends(client);
    client.Dota2 = new Dota2.Dota2Client(client, false, false);
    var user = users[i];
    var pass = passes[i];
    var logOnDetails = {
        "account_name": user,
        "password": pass
    };
    client.connect();
    client.on('connected', function() {
        console.log("[STEAM] Trying to log on with %s,%s", user, pass);
        client.steamUser.logOn(logOnDetails);
        client.once('error', function onSteamError(e) {
            //reset
            console.log(e);
            console.log("reconnecting");
            client.connect();
        });
    });
    client.on("logOnResponse", function(logonResp) {
        if (logonResp.eresult !== Steam.EResult.OK) {
            //try logging on again
            return client.steamUser.logOn(logOnDetails);
        }
        console.log("[STEAM] Logged on %s", client.steamID);
        client.steamFriends.setPersonaName(client.steamID);
        steamObj[client.steamID] = client;
        client.Dota2.launch();
        client.Dota2.once("ready", function() {
            //console.log("Dota 2 ready");
            dotaReady = true;
            var dota = client.Dota2;
            dota.inviteToParty(utility.convert32to64(88367253).toString());
            setTimeout(function() {
                console.log('lobby');
                dota.leavePracticeLobby();
                dota.on('practiceLobbyUpdate', function(msg) {
                    console.log(msg);
                });
                dota.createPracticeLobby();
            }, 10000);
            cb();
        });
        client.once('loggedOff', function() {
            console.log("relogging");
            client.steamUser.logOn(logOnDetails);
        });
    });
}, function() {
    //start listening
    launched = true;
    var server = app.listen(port, function() {
        var host = server.address().address;
        console.log('[RETRIEVER] listening at http://%s:%s', host, port);
    });
    app.get('/', function(req, res, next) {});
});