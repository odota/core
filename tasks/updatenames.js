var utility = require('../utility');
var db = require('../db');
var queueReq = utility.queueReq;
module.exports = function(cb) {
    db.players.find({}, {
        sort: {
            last_summaries_update: 1
        },
        limit: 100
    }, function(err, docs) {
        if (err) {
            return cb(err);
        }
        var summaries = {
            summaries_id: new Date(),
            players: docs
        };
        queueReq("api_summaries", summaries, function(err) {
            cb(err);
        });
    });
};