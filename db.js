module.exports = function db(input) {
    var db = require('monk')(input || process.env.MONGO_URL || "mongodb://localhost/dota");
    db.get('matches').index('match_id', {
        unique: true
    });
    db.get('players').index('account_id', {
        unique: true
    });
    db.matches = db.get('matches');
    db.players = db.get('players');
    return db
}
