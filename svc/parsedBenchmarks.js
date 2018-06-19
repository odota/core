const queue = require('../store/queue');
const benchmarksUtil = require('../util/benchmarksUtil');
const buildMatch = require('../store/buildMatch');

const { updateBenchmarks } = benchmarksUtil;


function doParsedBenchmarks(matchID, cb) {
  buildMatch(matchID, (err, match) => {
    if (err) {
      return cb(err);
    }
    if (match.players) {
      return updateBenchmarks(match, cb, true);
    }
    return cb();
  });
}

queue.runQueue('parsedBenchmarksQueue', 1, doParsedBenchmarks);
