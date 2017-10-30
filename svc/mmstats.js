const redis = require('../store/redis');
const getMMStats = require('../util/getMMStats');
const utility = require('../util/utility');
const invokeInterval = utility.invokeInterval;
const config = require('../config');

function doMMStats(cb) {
  getMMStats(redis, cb);
}
invokeInterval(doMMStats, config.MMSTATS_DATA_INTERVAL * 60 * 1000); // Sample every 3 minutes
