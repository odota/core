var db = require('monk')(process.env.MONGO_URL || "mongodb://localhost/dota");
db.get('matches').index({
    'match_id': -1
}, {
    unique: true
});
db.get('matches').index({
    'match_seq_num': -1
}, {
    unique: true
});
db.get('matches').index('players.account_id');
db.get('players').index('account_id', {
    unique: true
});
db.matches = db.get('matches');
db.players = db.get('players');

module.exports = db;