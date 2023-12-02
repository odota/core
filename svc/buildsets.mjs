import buildSets from '../store/buildSets.js';
import redis from '../store/redis.js';
import db from '../store/db.js';
import utility from '../util/utility.js';
const { invokeInterval } = utility;
function doBuildSets(cb) {
  buildSets(db, redis, cb);
}
invokeInterval(doBuildSets, 60 * 1000);
