var config = require('../config');
var mongodb = require('monk')(config.MONGO_URL);
var pg = require('knex')({
    client: 'pg',
    connection: config.POSTGRES_URL
});
mongodb.get('players');
mongodb.get('matches').find({}).each(function(m) {
    pg('matches').columnInfo().then(function(info) {
        var row = {};
        for (var key in info) {
            if (key in m) {
                row[key] = m[key];
            }
            else if (m.parsed_data && key in m.parsed_data) {
                row[key] = m.parsed_data[key];
            }
            else {
                row[key] = null;
            }
        }
        pg.insert(row).into('matches');
    });
    m.players.forEach(function(pm) {
        var parseSlot = pm.player_slot % (128 - 5);
        var pp = m.parsed_data ? m.parsed_data.players[parseSlot] : null;
        pg('player_matches').columnInfo().then(function(info) {
            var row = {};
            for (var key in info) {
                if (key === "gold_t") {
                    row.gold_t = pp ? pp.gold : null;
                }
                else if (key === "xp_t") {
                    row.gold_t = pp ? pp.xp : null;
                }
                else if (key === "lh_t") {
                    row.gold_t = pp ? pp.lh : null;
                }
                else if (key === "killed") {
                    row.gold_t = pp ? pp.kills : null;
                }
                else if (key in pm) {
                    row[key] = pm[key];
                }
                else if (pp && key in pp) {
                    row[key] = pp[key];
                }
            }
            pg.insert(row).into('player_matches');
        });
    });
});
mongodb.get('players').find({}).each(function(p) {
    //TODO insert to players
    pg('players').columnInfo().then(function(info) {
        var row = {};
        for (var key in info) {
            row[key] = p[key];
        }
        pg.insert(row).into('players');
        //insert to player_ratings
        p.ratings.forEach(function(r) {
            pg.insert(r).into('player_ratings');
        });
    });
});
//MIGRATIONS
//TODO do the radiant gold adv/xp adv migration while we're at it
//TODO CODECHANGE
//rename parsed_data.players.gold, lh, xp -> (gold_t, lh_t, xp_t)
//rename parsed_data.players.kills -> killed
//remove hero_log, pick order data
//remove parsed_data.players.hero_id (nick was using?)
//last_summaries_update --remove code refs
//join_date --remove code refs
//rewrite advquery/fillplayerdata to select from player_matches then make separate query for played_with/played_against
//update aggregator to not ref parsedPlayer
//update views to not ref parsedPlayer
//TODO FILES
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
//when inserting player_match lookup by match_id, player_slot to ensure uniqueness (account_id doesn't work since anonymous)