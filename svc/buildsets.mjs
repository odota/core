import buildSets from '../store/buildSets.mjs';
import redis from '../store/redis.mjs';
import db from '../store/db.mjs';
import utility from '../util/utility.mjs';
const { invokeInterval } = utility;
function doBuildSets(cb) {
  buildSets(db, redis, cb);
}
invokeInterval(doBuildSets, 60 * 1000);
