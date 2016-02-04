var db = require("../db");
var async = require("async");
db.ratings.find({}, {
    sort: {
        time: 1
    }
}, function(err, docs) {
    if (err) {
        console.log(err);
    }
    async.eachSeries(docs, function(d, cb) {
        db.players.update({
            account_id: d.account_id
        }, {
            $push: {
                ratings: d
            }
        }, function(err) {
            console.log(d);
            cb(err);
        });
    }, function(err) {
        if (err) {
            console.log(err);
        }
        console.log("done!");
    });
});