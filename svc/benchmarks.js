import { runQueue } from '../store/queue.js';
import benchmarksUtil from '../util/benchmarksUtil.js';
import buildMatch from '../store/buildMatch.js';
import { isSignificant, getStartOfBlockMinutes } from '../util/utility.js';
import { BENCHMARK_RETENTION_MINUTES } from '../config.js';
import redis from '../store/redis.js';

const { benchmarks } = benchmarksUtil;

async function doBenchmarks(matchID, cb) {
  try {
    const match = await buildMatch(matchID);
    if (match.players && isSignificant(match)) {
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
                getStartOfBlockMinutes(
                  BENCHMARK_RETENTION_MINUTES,
                  0
                ),
                key,
                p.hero_id,
              ].join(':');
              redis.zadd(rkey, metric, match.match_id);
              // expire at time two epochs later (after prev/current cycle)
              const expiretime = getStartOfBlockMinutes(
                BENCHMARK_RETENTION_MINUTES,
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

runQueue('parsedBenchmarksQueue', 1, doBenchmarks);
