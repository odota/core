var config = require('../config');
var mongodb = require('monk')(config.MONGO_URL);
var pg = require('knex')({
    client: 'pg',
    connection: config.POSTGRES_URL
});
mongodb.get('players');
mongodb.get('matches').find({}).each(function(m) {
    var match = {};
    var player_match = {};
    //insert to match
    //insert to player_match
});
mongodb.get('players').find({}).each(function(p) {
    //insert to players
});
//MIGRATIONS
//rename parsed_data.players.gold, lh, xp -> (gold_t, lh_t, xp_t)
//rename parsed_data.players.kills -> killed
//player.ratings to player_ratings
//matches.parsed_data to matches
//matches.parsed_data.players to player_matches
//matches.players to player_matches
//subset of columns from matches to matches
//subset of columns from players to players
//do the radiant gold adv/xp adv migration while we're at it
//CODECHANGE
//rename parsed_data.players.gold, lh, xp -> (gold_t, lh_t, xp_t)
//rename parsed_data.players.kills -> killed
//remove hero_log, pick order data
//remove parsed_data.players.hero_id (nick was using?)
//last_summaries_update --remove code refs
//join_date --remove code refs
//rewrite advquery/fillplayerdata to select from player_matches then make separate query for played_with/played_against
//FILES
//pass a single db/redis reference around
//test/test.js
//processFullHistory.js
//processMmr.js
//tasks/fullHistory.js
//status.js
//buildSets.js
//operations.js
//updatePlayerCaches.js
//routes/donate.js
//routes/auth.js
//routes/players.js
//routes/matches.js
//db.js
//fillPlayerData.js
//config.js
//passport.js
//getReplayUrl.js
//advquery.js
//queries.js
//TODO
//UPSERT not supported until psql 9.5
//PRIMARY KEY of player_match should be match_id, account_id, player_slot to account for anonymous players
//when inserting player_match lookup by match_id, player_slot and update row