var ids = require("../test/ids.json");
var db = require('../db');

ids.forEach(function(id) {
    db.players.insert({
        account_id: id
    });
});
