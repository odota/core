const db = require('./dbreadonly');

module.exports = (input, cb) => {
  db.raw(input).timeout(10000).asCallback(cb);
};
