var passport = require('passport');
var config = require('./config');
var api_key = config.STEAM_API_KEY.split(",")[0];
var db = require('./db');
var SteamStrategy = require('passport-steam').Strategy;
var host = config.ROOT_URL;
var utility = require('./utility');
var operations = require('./operations');
var queueReq = operations.queueReq;
var convert64to32 = utility.convert64to32;
var r = require('./redis');
var redis = r.client;

passport.serializeUser(function(user, done) {
    done(null, user.account_id);
});
passport.deserializeUser(function(id, done) {
    db.players.findOne({
        account_id: id
    }, function(err, user) {
        //set token for this player's visit, expires in untrack days time
        redis.setex("visit:"+id, 60*60*24*config.UNTRACK_DAYS, id);
        done(err, user);
    });
});
passport.use(new SteamStrategy({
    returnURL: host + '/return',
    realm: host,
    apiKey: api_key
}, function initializeUser(identifier, profile, done) {
    var steam32 = Number(convert64to32(identifier.substr(identifier.lastIndexOf("/") + 1)));
    var insert = profile._json;
    insert.account_id = steam32;
    insert.join_date = new Date();
    insert.last_summaries_update = new Date();
    done(null, insert);
}));
module.exports = passport;