var db = require('../db');
db.raw('select * from player_matches where match_id = 2208963728').asCallback(function(err, result)
{
    result.rows.forEach(function(r){
        for (var key in r){
            console.log(key, JSON.stringify(r[key]).length);
        }
    });
    process.exit(Number(err));
});
module.exports = db;
