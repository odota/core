const utility = require('../util/utility');
const config = require('../config');

const secret = config.RETRIEVER_SECRET;
const getData = utility.getData;
const retrieverArr = utility.getRetrieverArr();
const DATA_POINTS = (60 / (config.MMSTATS_DATA_INTERVAL || 1)) * 24; // Store 24 hours worth of data

function getMMStats(redis, cb) {
  const urls = retrieverArr.map(r =>
    `http://${r}?key=${secret}&mmstats=1`);
  getData({ url: urls }, (err, body) => {
    if (err) {
      return cb(err);
    }
    redis.lpush('mmstats:time', Date.now());
    redis.ltrim('mmstats:time', 0, DATA_POINTS);
    body.forEach((elem, index) => {
      redis.lpush(`mmstats:${index}`, elem);
      redis.ltrim(`mmstats:${index}`, 0, DATA_POINTS);
    });
    return cb(err);
  });
}

module.exports = getMMStats;
