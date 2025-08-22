// Runs health checks periodically and writes result to Redis
import axios from 'axios';
import config from '../config';
import redis from './store/redis';
import db from './store/db';
import cassandra from './store/cassandra';
const apiKey = config.STEAM_API_KEY.split(',')[0];

const health = {
  // steamApi,
  postgresUsage,
  redisUsage,
  cassandraUsage,
  seqNumDelay,
  parseDelay,
  fhDelay,
  gcDelay,
  mmrDelay,
  cacheDelay,
  countsDelay,
  scenariosDelay,
  profileDelay,
};

type Metric = {
  metric: number;
  threshold: number;
  timestamp?: number;
};
setInterval(async () => {
  const result: Record<string, Metric> = {};
  const arr = Object.entries(health);
  for (let i = 0; i < arr.length; i++) {
    const [key, value] = arr[i];
    let final: Metric = {
      metric: 1,
      threshold: 1,
      timestamp: Math.floor(Date.now() / 1000),
    };
    try {
      final = await value();
      final.timestamp = Math.floor(Date.now() / 1000);
      console.log('[%s]: %s', key, JSON.stringify(final));
    } catch (e) {
      console.log('[%s] error: %s', key, e);
    }
    result[key] = final;
  }
  await redis.set('health:v2', JSON.stringify(result));
  await redis.expire('health:v2', 900);
}, 10000);

async function steamApi() {
  const resp = await axios.get(
    'http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?key=' +
      apiKey,
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
      apiKey,
  );
  const body = resp.data;
  // get match_seq_num, compare with real seqnum
  const currSeqNum = body.result.matches[0].match_seq_num;
  const result = await db.raw('select max(match_seq_num) from last_seq_num;');
  const numResult = Number(result.rows[0].max) || 0;
  const metric = currSeqNum - numResult;
  return {
    metric,
    threshold: 50000,
  };
}
async function parseDelay() {
  const result = await db.raw(
    "select count(*) from queue where type = 'parse'",
  );
  return {
    metric: result.rows[0].count,
    threshold: 10000,
  };
}
async function gcDelay() {
  const result = await redis.llen('gcQueue');
  return {
    metric: result,
    threshold: 100000,
  };
}
async function fhDelay() {
  const result = await redis.llen('fhQueue');
  return {
    metric: result,
    threshold: 100000,
  };
}
async function mmrDelay() {
  const result = await redis.llen('mmrQueue');
  return {
    metric: result,
    threshold: 100000,
  };
}
async function cacheDelay() {
  const result = await redis.llen('cacheQueue');
  return {
    metric: result,
    threshold: 100000,
  };
}
async function countsDelay() {
  const result = await redis.llen('countsQueue');
  return {
    metric: result,
    threshold: 100000,
  };
}
async function scenariosDelay() {
  const result = await redis.llen('scenariosQueue');
  return {
    metric: result,
    threshold: 100000,
  };
}
async function profileDelay() {
  const result = await redis.llen('profileQueue');
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
    "select mean_partition_size, partitions_count from system.size_estimates where keyspace_name = 'yasp'",
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
    metric: Number(line?.split(':')[1]),
    threshold: 4 * 10 ** 9,
  };
}
