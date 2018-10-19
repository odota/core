const queue = require('../store/queue');
const benchmarksUtil = require('../util/benchmarksUtil');
const buildMatch = require('../store/buildMatch');
const utility = require('../util/utility');
const config = require('../config');
const redis = require('../store/redis');

const { benchmarks } = benchmarksUtil;

async function doParsedBenchmarks(matchID, cb) {
  try {
    const match = buildMatch(matchID);
    if (match.players && utility.isSignificant(match)) {
      for (let i = 0; i < match.players.length; i += 1) {
        const p = match.players[i];
        // only do if all players have heroes
        if (p.hero_id) {
          Object.keys(benchmarks).forEach((key) => {
            const metric = benchmarks[key](match, p);
            if (metric !== undefined && metric !== null && !Number.isNaN(Number(metric))) {
              const rkey = [
                'benchmarks',
                utility.getStartOfBlockMinutes(config.BENCHMARK_RETENTION_MINUTES, 0),
                key,
                p.hero_id,
              ].join(':');
              redis.zadd(rkey, metric, match.match_id);
              // expire at time two epochs later (after prev/current cycle)
              const expiretime = utility.getStartOfBlockMinutes(config.BENCHMARK_RETENTION_MINUTES, 2);
              redis.expireat(rkey, expiretime);
            }
          });
        }
      }
      return cb();
    }
    return cb();
  } catch (err) {
    return cb(err);
  }
}

queue.runQueue('parsedBenchmarksQueue', 1, doParsedBenchmarks);
