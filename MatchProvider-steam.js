var fs = require("fs"),
    util = require("util"),
    steam = require("steam"),
    dota2 = require("dota2"),
    deferred = require("deferred");

var MatchProvider = function(user, pass, name, authcode, cwd, steam_response_timeout) {
    this.steam_response_timeout = steam_response_timeout || 1000 * 30;

    this.ready = false;
    this.bot = new steam.SteamClient(),
    this.Dota2 = new dota2.Dota2Client(this.bot, true);
    this.match_deferreds = {}; // Prevents F5DoS.

    var self = this;
    var onSteamLogOn = function onSteamLogOn(){
        self.bot.setPersonaState(steam.EPersonaState.Busy);
        self.bot.setPersonaName(name);
        util.log("Logged on.");

        self.Dota2.launch();
        self.Dota2.on("ready", function() {
            util.log("Dota 2 ready");
            self.ready = true;
        });

        self.Dota2.on("matchData", function (matchId, matchData) {
            if (!self.match_deferreds[matchId]) return;
            self.match_deferreds[matchId].resolve(matchData);
        });

        self.Dota2.on("unhandled", function(kMsg) {
            util.log("Unhandled message: " + kMsg);
        });
    },
    onSteamSentry = function onSteamSentry(newSentry) {
        util.log("Received sentry.");
        fs.writeFileSync(cwd + "sentry", newSentry);
    },
    onSteamServers = function onSteamServers(servers) {
        util.log("Received servers.");
        fs.writeFile(cwd + 'servers', JSON.stringify(servers));
    };

    this.bot.logOn({
        "accountName": user,
        "password": pass,
        "authCode": authcode,
        "shaSentryfile": fs.readFileSync(cwd + "sentry")
    });
    this.bot.on("loggedOn", onSteamLogOn)
        .on('sentry', onSteamSentry)
        .on('servers', onSteamServers);
};

MatchProvider.prototype.getMatchDetails = function getMatchDetails(matchId, callback) {
    if (!this.ready) { callback("GC not ready"); return; }

    // F5DoS protection; if we're waiting for a response for this Match ID then don't send a new request.
    if (!this.match_deferreds[matchId]) {
        this.match_deferreds[matchId] = new deferred();
        this.match_deferreds[matchId].pms = this.match_deferreds[matchId].promise();
        this.Dota2.matchDetailsRequest(matchId);
    }

    var self = this;
    this.match_deferreds[matchId].pms.then(function (data){
        delete self.match_deferreds[matchId];
        callback(null, { id: data.match.matchId,
            cluster: data.match.cluster,
            salt: data.match.replaySalt,
            state: data.match.replayState });
    });

    // Time out request after so long - GC doesn't tell us match ids when it returns bad status',
    // so this is the best way to weed out invalid match ids.
    setTimeout(function(){
        delete self.match_deferreds[matchId];
    }, this.steam_response_timeout);
};

exports.MatchProvider = MatchProvider;