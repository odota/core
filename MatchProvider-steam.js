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
    },
    onSteamError = function onSteamError(e) {
        if (e.cause == "logonFail") {
            switch (e.eresult) {
                case steam.EResult.InvalidPassword:
                    throw "Error: Steam cannot log on - Invalid password.";
                case steam.EResult.AccountLogonDenied:
                    throw "Error: Steam cannot log on - Account logon denied (Steam Guard code required)";
                case steam.EResult.InvalidLoginAuthCode:
                    throw "Error: Steam cannot log on - Invalid Steam Guard code (remove whats set in config.js to have a new one sent)";
                case steam.EResult.AlreadyLoggedInElsewhere :
                    throw "Error: Steam cannot log on - Account already logged in elsewhere.";
            }
        }
    };

    // node-steam's logOn now requires an object that is a valid protobuf
    // payload so we must omit authCode or shaSentryFile if ours are empty.
    var logOnDetails = {
        "accountName": user,
        "password": pass
    },
        sentry = fs.readFileSync(cwd + "sentry");

    if (authcode) logOnDetails.authCode = authcode;
    if (sentry.length) logOnDetails.shaSentryfile = sentry;

    this.bot.logOn(logOnDetails);
    this.bot.on("loggedOn", onSteamLogOn)
        .on('sentry', onSteamSentry)
        .on('servers', onSteamServers)
        .on('error', onSteamError);
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