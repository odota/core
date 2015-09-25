var db = require('../db');
var queueReq = require('../operations').queueReq;
/**
 * Gets the least recently updated 100 users in db and queues for new Steam data
 **/
module.exports = function updateNames(cb) {
    db.players.find({}, {
        sort: {
            last_summaries_update: 1
        },
        fields: {
            account_id: 1
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