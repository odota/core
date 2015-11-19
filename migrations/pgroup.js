var db = require('../db');
var async = require('async');
var args = process.argv.slice(2);
var start_id = Number(args[0]) || 0;
//ALTER TABLE matches ADD COLUMN pgroup json;
db.select('match_id').from('matches').where('match_id', '>=', start_id).andWhereNull("pgroup").orderBy("match_id","asc").asCallback(function(err, matches) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    async.eachSeries(matches, function(m, cb) {
        db.select(["account_id", "hero_id", "player_slot"]).from('player_matches').where({match_id: m.match_id}).asCallback(function(err, pms){
            if (err){
                return cb(err);
            }
            var pgroup = {};
            pms.forEach(function(p){
               pgroup[p.player_slot] = p;
            });
            console.log(m.match_id);
            db('matches').update({pgroup: pgroup}).where({match_id: m.match_id}).asCallback(cb);
        });
    }, function(err) {
        console.log(err);
        process.exit(Number(err));
    });
});