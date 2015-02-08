var db = require('../db');
var selector = require('../selector');

module.exports = function untrackPlayers(cb) {
    db.players.update(selector("untrack"), {
        $set: {
            track: 0
        }
    }, {
        multi: true
    }, function(err, num) {
        console.log("[UNTRACK] Untracked %s users", num);
        cb(err, num);
    });
};