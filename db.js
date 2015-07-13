var config = require('./config');
var db = require('monk')(config.MONGO_URL);
db.players = db.get('players');
db.matches = db.get('matches');
db.ratings = db.get('ratings');
db.matches.index({
    'players.account_id': 1,
    'match_id': -1
});
/*
db.matches.index({
    'players.hero_id': 1
});
*/
/*
db.matches.index({
    'parsed_data.players.steam_id': 1
});
*/
db.matches.index({
    'parsed_data.version': 1
});
db.matches.index({
    'match_id': -1
}, {
    unique: true
});
/*
db.matches.index({
    'match_seq_num': -1
}, {
    unique: true
});
*/
/*
db.matches.index({
    'start_time': -1,
    'parse_status': 1
});
*/
/*
db.matches.index({
    'leagueid': 1,
    'match_id': -1
});
*/
db.players.index('account_id', {
    unique: true
});
db.players.index({
    'ratings': 1
});
db.players.index({
    'cheese': -1
});
db.players.index({
    'last_visited': -1
});
db.players.index({
    'full_history_time': 1
});
db.players.index({
    'last_summaries_update': 1
});

module.exports = db;