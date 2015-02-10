var dotenv = require('dotenv');
dotenv.load();
var steam = require("steam"),
    dota2 = require("dota2");
var utility = require("./utility");
var convert64To32 = utility.convert64to32;
var users = process.env.STEAM_USER.split(",");
var passes = process.env.STEAM_PASS.split(",");
var loginNum = 0;
var steamArray = [];
var accountToIdx = {};

var express = require('express');
var app = express();
var counts = {};
var replayRequests = 0;
var launch = new Date();

//todo integrate ratingbot with yasp
//page gives list of bot accounts, user adds a bot
//yasp main receives match, checks for bot-enabled users.
//Can throw this task onto a queue.
//result returns current user rating.  update ratings collection with this match id, user, rating.
//yasp main worker task asks retrievers what account_ids they can get mmrs for, update these player documents with the retriever host

//upgrade retriever to v2 (supports replay salts and mmrs)
//retriever would need to log into all accounts simultaneously
//it would take replay salt requests (given a match id) from the current loginNum account
//it would also take mmr requests (given a player id) and respond to those from the appropriate account
//how to look up which account has what friends?  build a lookup table on startup?
//would need to be updated as friends were added

//todo
//iterate through provided steam creds
//construct a steam/dota instance with each and place in an array
//on relationships, steam populates global hash with 32 bit friend steam ids to Steam.index, update the counts
//on receiving a http request, determine if player request or match request
//if match request, use the loginnum account
//if player request, lookup the right account and use that.  if not in lookup table, respond with error
//if receiving a friend request, accept it and update the lookup

//handle
//what if Dota 2 not ready?

app.get('/', function(req, res, next) {
    //todo reject request if doesnt have key
    if (req.query.match_id) {
        getGCReplayUrl(loginNum, req.query.match_id, function(err, data) {
            if (err) {
                return res.json({
                    error: err
                });
            }
            res.json(data);
        });
    }
    else if (req.query.account_id) {
        var idx = accountToIdx[req.query.account_id];
        getPlayerProfile(idx, req.query.account_id, function(err, data) {
            if (err) {
                return res.json({
                    error: err
                });
            }
            res.json(data);
        });
    }
    else {
        return res.json({
            loginNum: loginNum,
            replayRequests: replayRequests,
            uptime: (new Date() - launch) / 1000,
            counts: counts,
            accountToIdx: accountToIdx
        });
    }
});

for (var i = 0; i < users.length; i++) {
    counts[i] = {
        attempts: 0,
        success: 0,
        friends: 0
    };
    var Steam = new steam.SteamClient();
    Steam.Dota2 = new dota2.Dota2Client(Steam, false);
    Steam.idx = i;
    steamArray.push(Steam);

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
        Steam.Dota2.launch();
        Steam.Dota2.on("ready", function() {
            console.log("Dota 2 ready");
        });
    });
    Steam.on('error', function onSteamError(e) {
        console.log(e);
    });
    Steam.on("relationships", function() {
        //console.log(Steam.EFriendRelationship);
        console.log("searching for pending friend requests...");
        //friends is a object with key steam id and value relationship
        console.log(Steam.friends);
        for (var prop in Steam.friends) {
            //iterate through friends and accept requests/populate hash
            var steamID = prop;
            var relationship = Steam.friends[prop];
            if (relationship == Steam.EFriendRelationship.PendingInvitee) {
                Steam.addFriend(steamID);
                console.log(steamID + " was added as a friend");
            }
            accountToIdx[convert64To32(steamID)] = Steam.idx;
            counts[Steam.idx].friends += 1;
        }
        console.log("finished searching");
    });
}

function getPlayerProfile(num, account_id, cb) {
    var Dota2 = steamArray[num].Dota2;
    console.log("requesting player profile %s", account_id);
    Dota2.profileRequest(account_id, false);
    Dota2.on('profileData', function(accountId, profileData) {
        cb(null, profileData.gameAccountClient);
    });
}

function getGCReplayUrl(num, match_id, cb) {
    var Dota2 = steamArray[num].Dota2;
    console.log("[DOTA] requesting replay %s, loginNum: %s, numusers: %s", match_id, loginNum, users.length);
    var dotaTimeOut = setTimeout(function() {
        console.log("[DOTA] request for replay timed out");
        loginNum++;
        cb("timeout");
    }, 10000);
    replayRequests += 1;
    if (replayRequests >= 500) {
        selfDestruct();
    }
    counts[loginNum].attempts += 1;
    Dota2.matchDetailsRequest(match_id, function(err, data) {
        clearTimeout(dotaTimeOut);
        counts[loginNum].success += 1;
        cb(err, data);
    });
}

function selfDestruct() {
    process.exit(0);
}

var server = app.listen(process.env.RETRIEVER_PORT || process.env.PORT || 5100, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[RETRIEVER] listening at http://%s:%s', host, port);
});
