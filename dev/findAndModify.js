process.env.MONGO_URL = "mongodb://localhost/test";
var db = require("../db");
db.matches.findAndModify({
    match_id: 123
}, {
    $set: {
        match_id: 123,
        test: 1
    }
}, {
    upsert: true,
    new: false
}, function(err, doc, test) {
    console.log(err, doc, test);
    /*
    db.matches.remove({
        match_id: 123
    }, function(err) {
        console.log(err || "removed");
    });
    */
});
