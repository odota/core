import queue from '../store/queue.mjs';
import buildMatch from '../store/buildMatch.mjs';
import utility from '../util/utility.js';
import config from '../config.js';
import redis from '../store/redis.mjs';

const benchmarks = {
  gold_per_min(m, p) {
    return p.gold_per_min;
  },
  xp_per_min(m, p) {
    return p.xp_per_min;
  },
  kills_per_min(m, p) {
    return (p.kills / m.duration) * 60;
  },
  last_hits_per_min(m, p) {
    return (p.last_hits / m.duration) * 60;
  },
  hero_damage_per_min(m, p) {
    return (p.hero_damage / m.duration) * 60;
  },
  hero_healing_per_min(m, p) {
    return (p.hero_healing / m.duration) * 60;
  },
  tower_damage(m, p) {
    return p.tower_damage;
  },
  // stuns_per_min(m, p) {
  //   return (p.stuns / m.duration) * 60;
  // },
  // lhten(m, p) {
  //   return p.lh_t && p.lh_t[10];
  // },
};

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
