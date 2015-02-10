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
db.matches = db.get('matches');
db.get('players').index('account_id', {
    unique: true
});
db.players = db.get('players');
db.get('ratings').index({'match_id':-1, 'account_id': 1}, {unique:true});
db.ratings = db.get('ratings');

module.exports = db;