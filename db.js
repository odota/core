module.exports = function(dburl) {
    var conn = require('monk')(dburl || process.env.MONGO_URL || "mongodb://localhost/dota");
    conn.matches.index('match_id', {
        unique: true
    });
    conn.players.index('account_id', {
        unique: true
    });
    this.matches = conn.get('matches');
    this.players = conn.get('players');
};