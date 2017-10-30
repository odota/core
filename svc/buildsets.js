const buildSets = require('../store/buildSets');
const redis = require('../store/redis');
const db = require('../store/db');
const utility = require('../util/utility');
const invokeInterval = utility.invokeInterval;

function doBuildSets(cb) {
  buildSets(db, redis, cb);
}
invokeInterval(doBuildSets, 60 * 1000);
