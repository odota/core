var fullhistory = require('./fullhistory');
module.exports = function(cb) {
    fullhistory(cb, true);
};