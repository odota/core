/**
 * Worker that monitors health metrics and saves results
 * */
const config = require('../config');
const redis = require('../store/redis');
const db = require('../store/db');
const cassandra = require('../store/cassandra');
const utility = require('../util/utility');
const request = require('request');

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
  }());
}

function steamApi(cb) {
  request(`${'http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?key='}${apiKey}`, (err, resp, body) => {
    if (err || resp.statusCode !== 200) {
      return cb('bad http response');
    }
    try {
      const fail = err || resp.statusCode !== 200 || JSON.parse(body).result.status !== 1;
      return cb(fail, {
        metric: Number(fail),
        threshold: 1,
      });
    } catch (e) {
      return cb('malformed http response');
    }
  });
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
        threshold: 10000,
      });
    });
  });
}

function parseDelay(cb) {
  db.raw('select count(*) from queue where type = \'parse\'').asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return cb(err, {
      metric: result.rows[0].count,
      threshold: 2000,
    });
  });
}

function postgresUsage(cb) {
  db.raw('select pg_database_size(\'yasp\')').asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return cb(err, {
      metric: result.rows[0].pg_database_size,
      threshold: 2 * (10 ** 11),
    });
  });
}

function cassandraUsage(cb) {
  cassandra.execute('select mean_partition_size, partitions_count from system.size_estimates where keyspace_name = \'yasp\'', (err, result) => {
    if (err) {
      return cb(err);
    }
    let size = 0;
    result.rows.forEach((r) => {
      size += r.mean_partition_size * r.partitions_count * 0.5 * 4;
    });
    return cb(err, {
      metric: size,
      threshold: 10 * (10 ** 12),
    });
  });
}

function redisUsage(cb) {
  redis.info((err) => {
    if (err) {
      return cb(err);
    }
    // console.log(info);
    return cb(err, {
      metric: Number(redis.server_info.used_memory),
      threshold: 2.5 * (10 ** 9),
    });
  });
}
const health = {
  steamApi,
  seqNumDelay,
  parseDelay,
  postgresUsage,
  cassandraUsage,
  redisUsage,
};
Object.keys(health).forEach((key) => {
  invokeInterval(health[key]);
});
