// Runs health checks periodically and writes result to Redis
import axios from 'axios';
import config from '../config.js';
import redis from '../store/redis.mjs';
import db from '../store/db.mjs';
import cassandra from '../store/cassandra.mts';
const apiKey = config.STEAM_API_KEY.split(',')[0];

const health = {
  steamApi,
  seqNumDelay,
  parseDelay,
  gcDelay,
  postgresUsage,
  cassandraUsage,
  redisUsage,
};

setInterval(() => {
  Object.entries(health).forEach(async ([key, value]) => {
    let final: {
      metric: number;
      threshold: number;
      timestamp?: number;
    } = {
      metric: 1,
      threshold: 1,
    };
    try {
      final = await value();
      final.timestamp = Math.floor(Number(new Date()) / 1000);
      console.log('[%s]: %s', key, JSON.stringify(final));
    } catch (e) {
      console.log('[%s] error: %s', key, e);
    }
    await redis.hset('health', key, JSON.stringify(final));
    await redis.expire('health', 900);
  });
}, 10000);

async function steamApi() {
  const resp = await axios.get(
    'http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?key=' +
      apiKey
  );
  const body = resp.data;
  const fail = body.result.status !== 1;
  return {
    metric: Number(fail),
    threshold: 1,
  };
}
async function seqNumDelay() {
  const resp = await axios.get(
    'http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?key=' +
      apiKey
  );
  const body = resp.data;
  // get match_seq_num, compare with real seqnum
  const currSeqNum = body.result.matches[0].match_seq_num;
  let num = await redis.get('match_seq_num');
  num = Number(num);
  const metric = currSeqNum - num;
  return {
    metric,
    threshold: 50000,
  };
}
async function parseDelay() {
  const result = await db.raw(
    "select count(*) from queue where type = 'parse'"
  );
  return {
    metric: result.rows[0].count,
    threshold: 5000,
  };
}
async function gcDelay() {
  const result = await redis.llen('gcQueue');
  return {
    metric: result,
    threshold: 100000,
  };
}
async function postgresUsage() {
  const result = await db.raw("select pg_database_size('yasp')");
  return {
    metric: result.rows[0].pg_database_size,
    threshold: 4 * 10 ** 11,
  };
}
async function cassandraUsage() {
  const result = await cassandra.execute(
    "select mean_partition_size, partitions_count from system.size_estimates where keyspace_name = 'yasp'"
  );
  let size = 0;
  result.rows.forEach((r) => {
    size += r.mean_partition_size * r.partitions_count;
  });
  return {
    metric: size,
    threshold: 3 * 10 ** 12,
  };
}
async function redisUsage() {
  const info = await redis.info();
  const line = info
    .split('\n')
    .find((line: string) => line.startsWith('used_memory'));
  return {
    metric: Number(line.split(':')[1]),
    threshold: 4 * 10 ** 9,
  };
}
