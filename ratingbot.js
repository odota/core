var dotenv = require('dotenv');
dotenv.load();
var steam = require("steam"),
    dota2 = require("dota2"),
    Steam = new steam.SteamClient(),
    Dota2 = new dota2.Dota2Client(Steam, false),
    fs = require('fs');
var users = process.env.STEAM_USER.split(",");
var passes = process.env.STEAM_PASS.split(",");

var loginNum = 0;
var user = users[loginNum];
var pass = passes[loginNum];
var logOnDetails = {
    "accountName": user,
    "password": pass
};
if (!fs.existsSync("sentry")) {
    fs.openSync("sentry", 'w');
}
var sentry = fs.readFileSync("sentry");
if (sentry.length) logOnDetails.shaSentryfile = sentry;
Steam.logOn(logOnDetails);
console.log("[STEAM] Trying to log on with %s,%s", user, pass);
var onSteamLogOn = function onSteamLogOn() {
        console.log("[STEAM] Logged on %s", Steam.steamID);
    },
    onSteamRelationships = function() {
        Dota2.launch();
        Dota2.on("ready", function() {
            //todo iterate through friends profiles
            console.log(Steam.friends);
            /*
            Dota2.profileRequest(accountId, false).on('profileData', function(accountId, profileData){
                            //todo get their mmr
            //todo go through their match history
            //add ranked game ids, time, and delta
            });
            */
            //Dota2.matchmakingStatsRequest().on('matchmakingStatsData', function(waitTimesByGroup, searchingPlayersByGroup, disabledGroups, matchmakingStatsResponse){})
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
        console.log(e);
    };
Steam.on("loggedOn", onSteamLogOn).on('sentry', onSteamSentry).on('servers', onSteamServers).on('error', onSteamError).on("relationships", onSteamRelationships);