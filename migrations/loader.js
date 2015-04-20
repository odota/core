var testdata = require("../test/test.json");
var matches = testdata.matches;
var players = testdata.players;
/*
var ratings = [{
    "match_id": 1238535235,
    "account_id": 88367253,
    "soloCompetitiveRank": 1765,
    "competitiveRank": 2783,
    "time": ISODate("2015-02-14T19:51:14Z")
}, {
    "match_id": 1238525881,
    "account_id": 88367253,
    "soloCompetitiveRank": 3566,
    "competitiveRank": 3647,
    "time": ISODate("2015-02-14T19:54:27Z")
}, {
    "match_id": 1238514627,
    "account_id": 88367253,
    "soloCompetitiveRank": 3125,
    "competitiveRank": 3408,
    "time": ISODate("2015-02-14T19:57:23Z")
}, {
    "account_id": 1234,
    "competitiveRank": 3690,
    "match_id": 1233353317,
    "soloCompetitiveRank": 3440,
    "time": ISODate("2015-02-13T08:07:18Z")
},
{
    "account_id": 88367253,
    "competitiveRank": 3690,
    "match_id": 1233353318,
    "soloCompetitiveRank": 3940,
    "time": ISODate("2015-02-28T08:07:18Z")
}]
*/
db.players.drop();
db.matches.drop();
db.players.insert(players);
db.matches.insert(matches);
