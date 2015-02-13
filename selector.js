var moment = require('moment');

module.exports = function(type) {
    var active = {
        $gt: moment().subtract(3, 'day').toDate()
    };
    var opts = {
        "tracked": {
            last_visited: active
        },
        "fullhistory": {
            last_visited: active,
            join_date: {
                $lt: moment().subtract(7, 'day').toDate()
            },
            last_visited: {
                $gt: moment().subtract(1, 'day').toDate()
            }
        }
    };
    return opts[type];
};