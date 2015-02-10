var dotenv = require('dotenv');
dotenv.load();
var steam = require("steam"),
    dota2 = require("dota2");
var utility = require("./utility");
var async = require('async');
var convert64To32 = utility.convert64to32;
var express = require('express');
var app = express();
var users = process.env.STEAM_USER.split(",");
var passes = process.env.STEAM_PASS.split(",");
var steamObj = {};
var accountToIdx = {};
var replayRequests = 0;
var launch = new Date();
var ready = false;

var a = [];
while (a.length < users.length) a.push(a.length + 0);
async.map(a, function(i, cb) {
    var Steam = new steam.SteamClient();
    Steam.Dota2 = new dota2.Dota2Client(Steam, false);
    Steam.EFriendRelationship = {
        None: 0,
        Blocked: 1,
        PendingInvitee: 2, // obsolete - renamed to RequestRecipient
        RequestRecipient: 2,
        Friend: 3,
        RequestInitiator: 4,
        PendingInviter: 4, // obsolete - renamed to RequestInitiator
        Ignored: 5,
        IgnoredFriend: 6,
        SuggestedFriend: 7,
        Max: 8,
    };

    var user = users[i];
    var pass = passes[i];
    var logOnDetails = {
        "accountName": user,
        "password": pass
    };
    Steam.logOn(logOnDetails);
    console.log("[STEAM] Trying to log on with %s,%s", user, pass);

    Steam.on("friend", function(steamID, relationship) {
        //immediately accept incoming friend requests
        if (relationship == Steam.EFriendRelationship.PendingInvitee) {
            console.log("friend request received");
            Steam.addFriend(steamID);
            console.log("friend request accepted");
            //todo update the hash
        }
    });
    Steam.on("loggedOn", function onSteamLogOn() {
        console.log("[STEAM] Logged on %s", Steam.steamID);
        Steam.setPersonaName("[YASP] " + Steam.steamID);
        steamObj[Steam.steamID] = Steam;
        Steam.attempts = 0;
        Steam.success = 0;
        Steam.on("relationships", function() {
            //console.log(Steam.EFriendRelationship);
            console.log("searching for pending friend requests...");
            //friends is a object with key steam id and value relationship
            console.log(Steam.friends);
            for (var prop in Steam.friends) {
                //iterate through friends and accept requests/populate hash
                var steamID = prop;
                var relationship = Steam.friends[prop];
                if (relationship === Steam.EFriendRelationship.PendingInvitee) {
                    Steam.addFriend(steamID);
                    console.log(steamID + " was added as a friend");
                }
                accountToIdx[convert64To32(steamID)] = Steam.steamID;
            }
            console.log("finished searching");
            Steam.Dota2.launch();
            Steam.Dota2.on("ready", function() {
                console.log("Dota 2 ready");
                cb();
            });
        });
    });
    Steam.on('error', function onSteamError(e) {
        console.log(e);
    });
}, function(err) {
    ready = !err;
});

function getPlayerProfile(idx, account_id, cb) {
    var Dota2 = steamObj[idx].Dota2;
    console.log("requesting player profile %s", account_id);
    Dota2.profileRequest(account_id, false, function(accountId, profileData) {
        cb(null, profileData.gameAccountClient);
    });
}

function getGCReplayUrl(idx, match_id, cb) {
    var Dota2 = steamObj[idx].Dota2;
    console.log("[DOTA] requesting replay %s, numusers: %s", match_id, users.length);
    var dotaTimeOut = setTimeout(function() {
        console.log("[DOTA] request for replay timed out");
        cb("timeout");
    }, 10000);
    replayRequests += 1;
    if (replayRequests >= 500) {
        selfDestruct();
    }
    steamObj[idx].attempts += 1;
    Dota2.matchDetailsRequest(match_id, function(err, data) {
        clearTimeout(dotaTimeOut);
        steamObj[idx].success += 1;
        cb(err, data);
    });
}

function selfDestruct() {
    process.exit(0);
}

app.get('/', function(req, res, next) {
    if (!ready) {
        return next("retriever not ready");
    }
    //todo reject request if doesnt have key
    var r = Object.keys(steamObj)[Math.floor((Math.random() * users.length))];
    if (req.query.match_id) {
        getGCReplayUrl(r, req.query.match_id, function(err, data) {
            if (err) {
                return next(err);
            }
            res.json(data);
        });
    }
    else if (req.query.account_id) {
        var idx = accountToIdx[req.query.account_id] || r;
        getPlayerProfile(idx, req.query.account_id, function(err, data) {
            if (err) {
                return next(err);
            }
            res.json(data);
        });
    }
    else {
        var stats = {};
        for (var key in steamObj) {
            stats[key] = {
                attempts: steamObj[key].attempts,
                success: steamObj[key].success,
                friends: Object.keys(steamObj[key].friends).length
            };
        }
        return res.json({
            replayRequests: replayRequests,
            uptime: (new Date() - launch) / 1000,
            accounts: stats,
            accountToIdx: accountToIdx
        });
    }
});
app.use(function(err, req, res, next) {
    return res.status(500).json({
        error: err
    });
});

var server = app.listen(process.env.RETRIEVER_PORT || process.env.PORT || 5100, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[RETRIEVER] listening at http://%s:%s', host, port);
});
