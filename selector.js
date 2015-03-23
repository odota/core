var moment = require('moment');
var config = require('./config');
module.exports = function(type) {
    var active = {
        $gt: moment().subtract(config.UNTRACK_DAYS, 'day').toDate()
    };
    var opts = {
        "tracked": {
            last_visited: active
        }
    };
    return opts[type];
};