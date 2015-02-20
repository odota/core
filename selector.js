var moment = require('moment');
module.exports = function(type) {
    var active = {
        $gt: moment().subtract(3, 'day').toDate()
    };
    var opts = {
        "tracked": {
            $or: [{
                last_visited: active
        }, {
                contributor: {
                    $gt: 0
                }
            }]
        },
        "fullhistory": {
            $or: [{
                    last_visited: active,
                    join_date: {
                        $lt: moment().subtract(7, 'day').toDate()
                    }
        },
                {
                    contributor: {
                        $gt: 0
                    }
            }]
        }
    };
    return opts[type];
};