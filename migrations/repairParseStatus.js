var db = require('../db');
db.matches.find({}).each(function(doc) {
    if (doc.parsed_data && doc.parse_status !== 2) {
        db.matches.update({
            match_id: doc.match_id
        }, {
            $set: {
                parse_status: 2
            }
        }, function(err) {
            console.log("repaired %s", doc.match_id);
        });
    }
}).error(function(err) {
    console.log(err);
}).success(function() {
    console.log("repair done");
});
