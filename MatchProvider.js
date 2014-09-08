var fs = require("fs"),
    steam = require("steam"),
    dota2 = require("dota2"),
    deferred = require("deferred");

var MatchProvider = function(user, pass, authcode, steam_response_timeout) {
    this.cwd = __dirname+'/';
    this.steam_response_timeout = process.env.STEAM_RESPONSE_TIMEOUT || 1000 * 30;

    this.ready = false;
    this.bot = new steam.SteamClient();
    this.Dota2 = new dota2.Dota2Client(this.bot, true);
    this.match_deferreds = {}; // Prevents F5DoS.

    var self = this;
    var onSteamLogOn = function onSteamLogOn(){
        self.bot.setPersonaState(steam.EPersonaState.Busy);
        self.bot.setPersonaName(user);
        console.log("Logged on.");

        self.Dota2.launch();
        self.Dota2.on("ready", function() {
            console.log("Dota 2 ready");
            self.ready = true;
        });

        self.Dota2.on("unhandled", function(kMsg) {
            console.log("Unhandled message: " + kMsg);
        });
    },
        onSteamSentry = function onSteamSentry(newSentry) {
            console.log("Received sentry.");
            fs.writeFileSync("sentry", newSentry);
        },
        onSteamServers = function onSteamServers(servers) {
            console.log("Received servers.");
            fs.writeFile("servers", JSON.stringify(servers));
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

    if (!fs.existsSync(this.cwd + "sentry")){
        fs.openSync(this.cwd + "sentry", 'w')
    }

    // node-steam's logOn now requires an object that is a valid protobuf
    // payload so we must omit authCode or shaSentryFile if ours are empty.
    var logOnDetails = {
        "accountName": user,
        "password": pass
    },

        sentry = fs.readFileSync(this.cwd + "sentry");

    if (authcode) logOnDetails.authCode = authcode;
    if (sentry.length) logOnDetails.shaSentryfile = sentry;

    this.bot.logOn(logOnDetails);
    this.bot.on("loggedOn", onSteamLogOn)
    .on('sentry', onSteamSentry)
    .on('servers', onSteamServers)
    .on('error', onSteamError);
};

MatchProvider.prototype.getReplayDetails = function getReplayDetails(matchId, callback) {
    if (!this.ready) { callback("GC not ready"); return; }
    var self = this;

    // F5DoS protection; if we're waiting for a response for this Match ID then don't send a new request.
    if (!this.match_deferreds[matchId]) {
        this.match_deferreds[matchId] = new deferred();
        this.match_deferreds[matchId].pms = this.match_deferreds[matchId].promise();
        this.Dota2.matchDetailsRequest(matchId, function(err, body){
            if (!self.match_deferreds[matchId]) return;
            self.match_deferreds[matchId].resolve(body);
        });
    }

    this.match_deferreds[matchId].pms.then(function (data){
        delete self.match_deferreds[matchId];
        if (data.result != 1) {
            callback("invalid");
        }
        else {
            callback(null, { id: matchId,
                            cluster: data.match.cluster,
                            salt: data.match.replaySalt,
                            state: data.match.replayState
                           });
        }
    });

    // Time out request after so long - GC doesn't tell us match ids when it returns bad status',
    // so this is the best way to weed out invalid match ids.
    setTimeout(function(){
        delete self.match_deferreds[matchId];
    }, this.steam_response_timeout);
};

exports.MatchProvider = MatchProvider;