const redis = require('../store/redis');
const getMMStats = require('../util/getMMStats');
const utility = require('../util/utility');
const config = require('../config');

const { invokeInterval } = utility;

function doMMStats(cb) {
  getMMStats(redis, cb);
}
invokeInterval(doMMStats, config.MMSTATS_DATA_INTERVAL * 60 * 1000); // Sample every 3 minutes
