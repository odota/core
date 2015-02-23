var testdata = require("../test/test.json");
var matches = testdata.matches;
var players = testdata.players;
db.players.insert(players);
db.matches.insert(matches);