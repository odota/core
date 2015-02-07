var dotenv = require('dotenv');
dotenv.load();
var steam = require("steam"),
    dota2 = require("dota2"),
    Steam = new steam.SteamClient(),
    Dota2 = new dota2.Dota2Client(Steam, false),
    fs = require('fs');
var users = process.env.STEAM_USER.split(",");
var passes = process.env.STEAM_PASS.split(",");
//todo use own set of logins, determine number based on foreman worker number or 0

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

Steam.on("friend", function(steamID, relationship) {
    //immediately accept incoming friend requests
    if (relationship == Steam.EFriendRelationship.PendingInvitee) {
        console.log("friend request received");
        steam.addFriend(steamID);
        console.log("friend request accepted");
    }
});
Steam.on("loggedOn", function onSteamLogOn() {
    console.log("[STEAM] Logged on %s", Steam.steamID);
    Steam.setPersonaName("[YASP]");
});
Steam.on('error', function onSteamError(e) {
    console.log(e);
});
Steam.on("relationships", function() {
    console.log(Steam.EFriendRelationship);
    addPendingFriends();
    Dota2.launch();
    Dota2.on("ready", function() {
        //todo iterate through friend list indefinitely, if relationship is 3 (friend), convert to steam32, request each profile
        Dota2.profileRequest(88367253, false);
        Dota2.on('profileData', function(accountId, profileData) {
            console.log(profileData.gameAccountClient.soloCompetitiveRank);
            console.log(profileData.gameAccountClient.competitiveRank);
            //todo is there a limit on profile requests?
            //insert into either new collection of mmrs or into player document
            //record time and mmr
            //only insert if changed since last
        });
    });
});
var addPendingFriends = function() {
    console.log("searching for pending friend requests...");
    //friends is a object with key steam id and value relationship
    console.log(Steam.friends);
    for (var prop in Steam.friends) {
        var steamID = prop;
        var relationship = Steam.friends[prop];
        if (relationship == Steam.EFriendRelationship.PendingInvitee) {
            Steam.addFriend(steamID);
            console.log(steamID + " was added as a friend");
        }
    }
    console.log("finished searching");
};