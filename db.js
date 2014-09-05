var db = require('monk')(process.env.MONGOHQ_URL || "localhost/dota");
module.exports = db;