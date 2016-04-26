/**
 * Worker interfacing with the Steam GC.
 * Provides HTTP endpoints for other workers.
 **/
var config = require('../config');
var Steam = require('steam');
var Dota2 = require('dota2');
var async = require('async');
var express = require('express');
var app = express();
var users = config.STEAM_USER.split(",");
var passes = config.STEAM_PASS.split(",");
var steamObj = {};
var accountToIdx = {};
var replayRequests = 0;
var launch = new Date();
var a = [];
var port = config.PORT || config.RETRIEVER_PORT;
//create array of numbers from 0 to n
var count = 0;
while (a.length < users.length) a.push(a.length + 0);
app.use(function(req, res, next)
{
    if (config.RETRIEVER_SECRET && config.RETRIEVER_SECRET !== req.query.key)
    {
        //reject request if doesnt have key
        return next("invalid key");
    }
    else
    {
        next(null);
    }
});
app.get('/', function(req, res, next)
{
    //console.log(process.memoryUsage());
    var keys = Object.keys(steamObj);
    if (keys.length == 0) return next("No accounts ready");
    var r = keys[Math.floor((Math.random() * keys.length))];
    if (req.query.mmstats)
    {
        getMMStats(r, function(err, data)
        {
            res.locals.data = data;
            return next(err);
        });
    }
    else if (req.query.match_id)
    {
        getGCReplayUrl(r, req.query.match_id, function(err, data)
        {
            res.locals.data = data;
            return next(err);
        });
    }
    else if (req.query.account_id)
    {
        getPlayerProfile(r, req.query.account_id, function(err, data)
        {
            res.locals.data = data;
            return next(err);
        });
    }
    else
    {
        res.locals.data = genStats();
        return next();
    }
});
app.use(function(req, res)
{
    res.json(res.locals.data);
});
app.use(function(err, req, res, next)
{
    return res.status(500).json(
    {
        error: err
    });
});
var server = app.listen(port, function()
{
    var host = server.address().address;
    console.log('[RETRIEVER] listening at http://%s:%s', host, port);
});
async.each(a, function(i, cb)
{
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
    client.on('connected', function()
    {
        console.log("[STEAM] Trying to log on with %s,%s", user, pass);
        client.steamUser.logOn(logOnDetails);
        client.once('error', function onSteamError(e)
        {
            console.log(e);
            console.log("reconnecting");
            client.connect();
        });
    });
    client.on("logOnResponse", function(logonResp)
    {
        if (logonResp.eresult !== Steam.EResult.OK)
        {
            //try logging on again
            return client.steamUser.logOn(logOnDetails);
        }
        console.log("[STEAM] Logged on %s", client.steamID);
        client.steamFriends.setPersonaName("[YASP] " + client.steamID);
        client.replays = 0;
        client.profiles = 0;
        client.Dota2.once("ready", function()
        {
            steamObj[client.steamID] = client;
            dotaReady = true;
            allDone();
        });
        client.Dota2.launch();
        client.once('loggedOff', function()
        {
            console.log("relogging");
            client.steamUser.logOn(logOnDetails);
        });
    });
    var cycled = false;

    function allDone()
    {
        if (dotaReady)
        {
            count += 1;
            console.log("acct %s ready, %s/%s", i, count, users.length);
            if (!cycled)
            {
                cycled = true;
                cb();
            }
        }
    }
});

function genStats()
{
    var stats = {};
    var numReadyAccounts = Object.keys(steamObj).length;
    for (var key in steamObj)
    {
        stats[key] = {
            steamID: key,
            replays: steamObj[key].replays,
            profiles: steamObj[key].profiles,
            friends: Object.keys(steamObj[key].steamFriends.friends).length
        };
    }
    var data = {
        replayRequests: replayRequests,
        uptime: (new Date() - launch) / 1000,
        numReadyAccounts: numReadyAccounts,
        ready: numReadyAccounts === users.length,
        accounts: stats,
        accountToIdx: accountToIdx
    };
    return data;
}

function getMMStats(idx, cb)
{
    steamObj[idx].Dota2.requestMatchmakingStats();
    steamObj[idx].Dota2.once('matchmakingStatsData', function(waitTimes, searchingPlayers, disabledGroups, raw)
    {
        if (disabledGroups) {
            cb(null, disabledGroups["legacy_searching_players_by_group_source2"]);
        } else {
            cb("error mmstats");
        }
    });
}

function getPlayerProfile(idx, account_id, cb)
{
    account_id = Number(account_id);
    var Dota2 = steamObj[idx].Dota2;
    console.log("requesting player profile %s", account_id);
    steamObj[idx].profiles += 1;
    /*
    Dota2.requestProfile(account_id, false, function(err, profileData) {
        //console.log(err, profileData);
        cb(err, profileData.game_account_client);
    });
    */
    Dota2.requestProfileCard(account_id, function(err, profileData)
    {
        /*
     	enum EStatID {
		k_eStat_SoloRank = 1;
		k_eStat_PartyRank = 2;
		k_eStat_Wins = 3;
		k_eStat_Commends = 4;
		k_eStat_GamesPlayed = 5;
		k_eStat_FirstMatchDate = 6;
    	}
    	*/
        if (err)
        {
            return cb(err);
        }
        var response = {};
        profileData.slots.forEach(function(s)
        {
            if (s.stat && s.stat.stat_id === 1)
            {
                response.solo_competitive_rank = s.stat.stat_score;
            }
            if (s.stat && s.stat.stat_id === 2)
            {
                response.competitive_rank = s.stat.stat_score;
            }
        });
        cb(err, response);
    });
}

function getGCReplayUrl(idx, match_id, cb)
{
    match_id = Number(match_id);
    var Dota2 = steamObj[idx].Dota2;
    console.log("[DOTA] requesting replay %s, numusers: %s, requests: %s", match_id, users.length, replayRequests);
    replayRequests += 1;
    if (replayRequests >= 500 && config.NODE_ENV !== "development")
    {
        selfDestruct();
    }
    steamObj[idx].replays += 1;
    Dota2.requestMatchDetails(match_id, function(err, matchData)
    {
        //console.log(err, matchData);
        cb(err, matchData);
    });
}

function selfDestruct()
{
    process.exit(0);
}
