//MIGRATIONS
//rename parsed_data.players.gold, lh, xp -> (gold_t, lh_t, xp_t)
//rename parsed_data.players.kills -> killed

//player.ratings to player_ratings
//matches.parsed_data to matches
//matches.parsed_data.players to player_matches
//matches.players to player_matches
//subset of columns from matches to matches
//subset of columns from players to players


//code changes
//remove parsed_data.players.hero_id (nick was using?)
//rename parsed_data.players.gold, lh, xp -> (gold_t, lh_t, xp_t)
//rename parsed_data.players.kills -> killed
