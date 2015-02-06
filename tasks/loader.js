var ids = require("../test/ids.json");
var utility = require("../utility");
var db = utility.db;

ids.forEach(function(id) {
    db.players.insert({
        account_id: id,
        track: 1
    });
});
