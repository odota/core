var moment = require('moment');

module.exports = function(type) {
    var opts = {
        "untrack": {
            track: 1,
            last_visited: {
                $lt: moment().subtract(3, 'day').toDate()
            }
        },
        "fullhistory": {
            track: 1,
            join_date: {
                $lt: moment().subtract(7, 'day').toDate()
            }
        }
    };
    return opts[type];
};