const db = require("../../store/db");

function getLeagues(req, res, cb) {
  db.select()
    .from("leagues")
    .asCallback((err, result) => {
      if (err) {
        return cb(err);
      }
      return res.json(result);
    });
}

module.exports = {
  getLeagues,
};
