const utility = require('../util/utility');
const config = require('../config');
const secret = config.RETRIEVER_SECRET;
const retrieverConfig = config.RETRIEVER_HOST;
const getData = utility.getData;
const DATA_POINTS = 60 / (config.MMSTATS_DATA_INTERVAL || 1) * 24; // Store 24 hours worth of data
function getMMStats(redis, cb) {
  const retrievers = retrieverConfig.split(',').map((r) => {
    return `http://${r}?key=${secret}`;
  });
  const result = retrievers;
    // make array of retriever urls and use a random one on each retry
  const urls = result.map((r) => {
    return `${r}&mmstats=1`;
  });
  getData(urls, (err, body) => {
    if (err) return cb(err);
    redis.lpush('mmstats:time', Date.now());
    redis.ltrim('mmstats:time', 0, DATA_POINTS);
    body.forEach((elem, index) => {
      redis.lpush(`mmstats:${index}`, elem);
      redis.ltrim(`mmstats:${index}`, 0, DATA_POINTS);
    });
    cb(err);
  });
}

module.exports = getMMStats;
