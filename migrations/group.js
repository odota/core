var db = require('../db');
var async = require('async');
var args = process.argv.slice(2);
var start_id = Number(args[0]) || 0;
//ALTER TABLE ADD COLUMN group json;
db.select('match_id').from('matches').where('account_id', '>', start_id).asCallback(function(err, matches) {
    if (err) {
        process.exit(1);
    }
    async.eachSeries(matches, function(m, cb) {
        db.select(["account_id", "hero_id", "player_slot"]).from('player_matches').where({match_id: m.match_id}).asCallback(function(err, pms){
            if (err){
                return cb(err);
            }
            var group = {};
            pms.forEach(function(p){
               group[p.player_slot] = p;
            });
            db('matches').update({group: group}).where({match_id: m.match_id}).asCallback(cb);
        });
    }, function(err) {
        console.log(err);
        process.exit(Number(err));
    });
});
