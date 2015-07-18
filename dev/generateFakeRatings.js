var db = require('../db');
for (var i = 0; i < 5000; i++) {
    db.players.insert({
        account_id: i,
        ratings: [
            {
                "match_id": 1238535235 + i,
                "account_id": i,
                "soloCompetitiveRank": i,
                "competitiveRank": i * 2,
                "time": new Date(i)
        }]
    });
}