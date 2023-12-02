import request from 'request';
import config from '../config.js';
import redis from '../store/redis.js';
import db from '../store/db.js';
import cassandra from '../store/cassandra.js';
import utility from '../util/utility.js';
const apiKey = config.STEAM_API_KEY.split(',')[0];
function invokeInterval(func) {
  // invokes the function immediately, waits for callback, waits the delay, and then calls it again
  (function invoker() {
    console.log('running %s', func.name);
    console.time(func.name);
    func((err, result) => {
      if (err) {
        console.error(err);
      }
      const final = result || {
        metric: 1,
        threshold: 0,
      };
      final.timestamp = Math.floor(new Date() / 1000);
      redis.hset('health', func.name, JSON.stringify(final));
      redis.expire('health', 900);
      console.timeEnd(func.name);
      setTimeout(invoker, final && final.delay ? final.delay : 10000);
    });
  })();
}
function steamApi(cb) {
  request(
    `${'http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?key='}${apiKey}`,
    (err, resp, body) => {
      if (err || resp.statusCode !== 200) {
        return cb('bad http response');
      }
      try {
        const fail =
          err ||
          resp.statusCode !== 200 ||
          JSON.parse(body).result.status !== 1;
        return cb(fail, {
          metric: Number(fail),
          threshold: 1,
        });
      } catch (e) {
        return cb('malformed http response');
      }
    }
  );
}
function seqNumDelay(cb) {
  utility.getData(utility.generateJob('api_history', {}).url, (err, body) => {
    if (err) {
      return cb('failed to get current sequence number');
    }
    // get match_seq_num, compare with real seqnum
    const currSeqNum = body.result.matches[0].match_seq_num;
    return redis.get('match_seq_num', (err, num) => {
      if (err) {
        return cb(err);
      }
      num = Number(num);
      const metric = currSeqNum - num;
      return cb(err, {
        metric,
        threshold: 50000,
      });
    });
  });
}
function parseDelay(cb) {
  db.raw("select count(*) from queue where type = 'parse'").asCallback(
    (err, result) => {
      if (err) {
        return cb(err);
      }
      return cb(err, {
        metric: result.rows[0].count,
        threshold: 3000,
      });
    }
  );
}
function gcDelay(cb) {
  redis.llen('gcQueue', (err, result) => {
    if (err) {
      return cb(err);
    }
    return cb(err, {
      metric: result,
      threshold: 300000,
    });
  });
}
function postgresUsage(cb) {
  db.raw("select pg_database_size('yasp')").asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return cb(err, {
      metric: result.rows[0].pg_database_size,
      threshold: 4 * 10 ** 11,
    });
  });
}
function cassandraUsage(cb) {
  cassandra.execute(
    "select mean_partition_size, partitions_count from system.size_estimates where keyspace_name = 'yasp'",
    (err, result) => {
      if (err) {
        return cb(err);
      }
      let size = 0;
      result.rows.forEach((r) => {
        size += r.mean_partition_size * r.partitions_count * 0.4;
      });
      return cb(err, {
        metric: size,
        threshold: 1.8 * 10 ** 12,
      });
    }
  );
}
async function redisUsage(cb) {
  try {
    const info = await redis.info();
    const line = info
      .split('\n')
      .find((line) => line.startsWith('used_memory'));
    return cb(null, {
      metric: Number(line.split(':')[1]),
      threshold: 4 * 10 ** 9,
    });
  } catch (e) {
    cb(e);
  }
}
const health = {
  steamApi,
  seqNumDelay,
  parseDelay,
  gcDelay,
  postgresUsage,
  cassandraUsage,
  redisUsage,
};
Object.keys(health).forEach((key) => {
  invokeInterval(health[key]);
});
