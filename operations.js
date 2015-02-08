var db = require('./db');
var utility = require('./utility');
var convert64to32 = utility.convert64to32;
var async = require('async');
var queueReq = utility.queueReq;

function insertMatch(match, cb) {
    match.parse_status = match.parsed_data ? 2 : 0;
    db.matches.update({
            match_id: match.match_id
        }, {
            $set: match
        }, {
            upsert: true
        },
        function(err) {
            if (err) {
                return cb(err);
            }
            //add players in match to db
            async.mapSeries(match.players, function(player, cb) {
                db.players.update({
                    account_id: player.account_id
                }, {
                    $set: {
                        account_id: player.account_id
                    }
                }, {
                    upsert: true
                }, function(err) {
                    cb(err);
                });
            }, function(err) {
                if (!match.parse_status) {
                    queueReq("parse", match, function(err) {
                        cb(err);
                    });
                }
                else {
                    cb(err);
                }
            });
        });
}

function insertPlayer(player, cb) {
    var account_id = Number(convert64to32(player.steamid));
    player.last_summaries_update = new Date();
    db.players.update({
        account_id: account_id
    }, {
        $set: player
    }, {
        upsert: true
    }, function(err) {
        cb(err);
    });
}

module.exports = {
    insertPlayer: insertPlayer,
    insertMatch: insertMatch
};