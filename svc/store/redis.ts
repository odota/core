import { Redis } from 'ioredis';
import config from '../../config.ts';
import moment from 'moment';

let redis: Redis | null = null;
if (config.REDIS_URL) {
  console.log('[REDIS] connecting %s', config.REDIS_URL);
  redis = new Redis(config.REDIS_URL);
}

export async function getRedisCountDay(prefix: MetricName) {
  // Get counts for last 24 hour keys (including current partial hour)
  const keyArr = [];
  for (let i = 0; i < 24; i += 1) {
    keyArr.push(
      `${prefix}:v2:${moment
        .utc()
        .startOf('hour')
        .subtract(i, 'hour')
        .format('X')}`,
    );
  }
  const counts = await redis?.mget(...keyArr);
  return counts?.reduce((a, b) => Number(a) + Number(b), 0);
}

export async function getRedisCountHour(prefix: MetricName) {
  const result = await redis?.get(
    `${prefix}:v2:${moment.utc().startOf('hour').format('X')}`,
  );
  return Number(result);
}

export async function getRedisCountLastHour(prefix: MetricName) {
  // Get counts for previous full hour (not current)
  const result = await redis?.get(
    `${prefix}:v2:${moment.utc().startOf('hour').subtract(1, 'hour').format('X')}`,
  );
  return Number(result);
}

export async function getRedisCountDayDistinct(prefix: MetricName) {
  // Get counts for last 24 hour keys (including current partial hour)
  const keyArr = [];
  for (let i = 0; i < 24; i += 1) {
    keyArr.push(
      `${prefix}:v2:${moment
        .utc()
        .startOf('hour')
        .subtract(i, 'hour')
        .format('X')}`,
    );
  }
  return redis?.pfcount(...keyArr);
}

export async function getRedisCountDayHash(prefix: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (let i = 0; i < 24; i += 1) {
    const key = 
      `${prefix}:${moment
        .utc()
        .startOf('hour')
        .subtract(i, 'hour')
        .format('X')}`;
    const hash = await redis?.hgetall(key);
    for (let key in hash) {
      result[key] = (result[key] ?? 0) + Number(hash[key]);
    }
  }
  return result;
}

/**
 * Increments an hourly Redis counter for the metric
 * @param prefix The counter name
 */
export async function redisCount(prefix: MetricName, incrBy = 1) {
  if (!redis) {
    return;
  }
  const key = `${prefix}:v2:${moment.utc().startOf('hour').format('X')}`;
  await redis.incrby(key, incrBy);
  await redis.expireat(
    key,
    moment.utc().startOf('hour').add(1, 'day').format('X'),
  );
}

export async function redisCountDistinct(prefix: MetricName, value: string) {
  if (!redis) {
    return;
  }
  const key = `${prefix}:v2:${moment.utc().startOf('hour').format('X')}`;
  await redis.pfadd(key, value);
  await redis.expireat(
    key,
    moment.utc().startOf('hour').add(1, 'day').format('X'),
  );
}

export async function redisCountHash(prefix: string, field: string, incrBy = 1) {
  if (!redis) {
    return;
  }
  const key = `${prefix}:${moment.utc().startOf('hour').format('X')}`;
  await redis.hincrby(key, field, incrBy);
  await redis.expireat(
    key,
    moment.utc().startOf('hour').add(1, 'day').format('X'),
  );
}

// This may be null if Redis is not configured
// Cast the type to avoid having to fix all callsites
// Callers that require Redis to function should crash (designed to flag issues)
// Some callers (e.g. counts) can just skip if Redis isn't available
export default redis as Redis;
