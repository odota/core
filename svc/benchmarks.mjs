import queue from '../store/queue.mjs';
import buildMatch from '../store/buildMatch.mjs';
import utility from '../util/utility.mjs';
import config from '../config.js';
import redis from '../store/redis.mjs';
import { benchmarks } from '../util/benchmarksUtil.mjs';

async function doBenchmarks(matchID, cb) {
  try {
    const match = await buildMatch(matchID);
    if (match.players && utility.isSignificant(match)) {
      for (let i = 0; i < match.players.length; i += 1) {
        const p = match.players[i];
        // only do if all players have heroes
        if (p.hero_id) {
          Object.keys(benchmarks).forEach((key) => {
            const metric = benchmarks[key](match, p);
            if (
              metric !== undefined &&
              metric !== null &&
              !Number.isNaN(Number(metric))
            ) {
              const rkey = [
                'benchmarks',
                utility.getStartOfBlockMinutes(
                  config.BENCHMARK_RETENTION_MINUTES,
                  0
                ),
                key,
                p.hero_id,
              ].join(':');
              redis.zadd(rkey, metric, match.match_id);
              // expire at time two epochs later (after prev/current cycle)
              const expiretime = utility.getStartOfBlockMinutes(
                config.BENCHMARK_RETENTION_MINUTES,
                2
              );
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
queue.runQueue('parsedBenchmarksQueue', 1, doBenchmarks);
