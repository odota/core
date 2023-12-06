import async from 'async';
import redis from '../store/redis.mts';
import { getRedisCountDay, getRedisCountHour } from '../util/utility.mts';

function generatePercentiles(arr: string[]) {
  // sort the list
  arr.sort((a, b) => Number(a) - Number(b));
  // console.log(arr);
  const percentiles = [50, 75, 90, 95, 99];
  const result: NumberDict = {};
  arr.forEach((time, i) => {
    if (i >= arr.length * (percentiles[0] / 100)) {
      result[percentiles[0]] = Number(time);
      // Pop the first element
      percentiles.shift();
    }
  });
  return result;
}

export async function buildStatus() {
  return await async.parallel(
    {
      user_players(cb) {
        redis.zcard('visitors', cb);
      },
      tracked_players(cb) {
        redis.zcard('tracked', cb);
      },
      matches_last_day(cb) {
        getRedisCountDay(redis, 'added_match', cb);
      },
      matches_last_hour(cb) {
        getRedisCountHour(redis, 'added_match', cb);
      },
      retriever_matches_last_day(cb) {
        getRedisCountDay(redis, 'retriever', cb);
      },
      retriever_players_last_day(cb) {
        getRedisCountDay(redis, 'retriever_player', cb);
      },
      // backup_retriever_last_day(cb) {
      //   getRedisCountDay(redis, "backup", cb);
      // },
      parsed_matches_last_day(cb) {
        getRedisCountDay(redis, 'parser', cb);
      },
      cached_gcdata_last_day(cb) {
        getRedisCountDay(redis, 'cached_gcdata', cb);
      },
      requests_last_day(cb) {
        getRedisCountDay(redis, 'request', cb);
      },
      requests_api_key_last_day(cb) {
        getRedisCountDay(redis, 'request_api_key', cb);
      },
      steam_api_backfill_last_day(cb) {
        getRedisCountDay(redis, 'steam_api_backfill', cb);
      },
      match_archive_read_last_day(cb) {
        getRedisCountDay(redis, 'match_archive_read', cb);
      },
      build_match_last_day(cb) {
        getRedisCountDay(redis, 'build_match', cb);
      },
      error_last_day(cb) {
        getRedisCountDay(redis, '500_error', cb);
      },
      web_crash_last_day(cb) {
        getRedisCountDay(redis, 'web_crash', cb);
      },
      fullhistory_last_day(cb) {
        getRedisCountDay(redis, 'fullhistory', cb);
      },
      skip_seq_num_last_day(cb) {
        getRedisCountDay(redis, 'skip_seq_num', cb);
      },
      api_hits_last_day(cb) {
        getRedisCountDay(redis, 'api_hits', cb);
      },
      api_hits_ui_last_day(cb) {
        getRedisCountDay(redis, 'api_hits_ui', cb);
      },
      seqNumDelay(cb) {
        // It's slow to query Steam API so use the value saved by monitor
        redis.hget('health', 'seqNumDelay', (err, data) => {
          cb(err, data ? JSON.parse(data)?.metric : null);
        });
      },
      parseQueue(cb) {
        // It's slow to count in postgres so use the value saved by monitor
        redis.hget('health', 'parseDelay', (err, data) => {
          cb(err, data ? JSON.parse(data)?.metric : null);
        });
      },
      fhQueue(cb) {
        redis.llen('fhQueue', cb);
      },
      gcQueue(cb) {
        redis.llen('gcQueue', cb);
      },
      mmrQueue(cb) {
        redis.llen('mmrQueue', cb);
      },
      countsQueue(cb) {
        redis.llen('countsQueue', cb);
      },
      scenariosQueue(cb) {
        redis.llen('scenariosQueue', cb);
      },
      benchmarksQueue(cb) {
        redis.llen('parsedBenchmarksQueue', cb);
      },
      retriever(cb) {
        redis.zrangebyscore(
          'retrieverCounts',
          '-inf',
          'inf',
          'WITHSCORES',
          (err, results) => {
            if (err) {
              return cb(err);
            }
            const response: any[] = [];
            results?.forEach((result, i) => {
              if (i % 2 === 0) {
                response.push({
                  hostname: result.split('.')[0],
                  count: results[i + 1],
                });
              }
            });
            return cb(err, response);
          }
        );
      },
      api_paths(cb) {
        redis.zrangebyscore(
          'api_paths',
          '-inf',
          'inf',
          'WITHSCORES',
          (err, results) => {
            if (err) {
              return cb(err);
            }
            const response: any[] = [];
            results?.forEach((result, i) => {
              if (i % 2 === 0) {
                response.push({
                  hostname: result.split('.')[0],
                  count: results[i + 1],
                });
              }
            });
            return cb(err, response);
          }
        );
      },
      load_times(cb) {
        redis.lrange('load_times', 0, -1, (err, arr) => {
          cb(err, generatePercentiles(arr ?? []));
        });
      },
      health(cb) {
        redis.hgetall('health', (err, result) => {
          if (err) {
            return cb(err);
          }
          const response = result || {};
          Object.keys(response).forEach((key) => {
            response[key] = JSON.parse(response[key]);
          });
          return cb(err, response);
        });
      },
    });
}
