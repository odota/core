import redis from '../store/redis';
import {
  getRedisCountDay,
  getRedisCountHour,
  parallelPromise,
} from '../util/utility';

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
  const obj = {
    user_players: async () => redis.zcard('visitors'),
    tracked_players: async () => redis.zcard('tracked'),
    matches_last_day: async () => getRedisCountDay(redis, 'added_match'),
    matches_prev_hour: async () => getRedisCountHour(redis, 'added_match'),
    auto_parse_last_day: async () => getRedisCountDay(redis, 'auto_parse'),
    retriever_matches_last_day: async () =>
      getRedisCountDay(redis, 'retriever'),
    retriever_players_last_day: async () =>
      getRedisCountDay(redis, 'retriever_player'),
    parsed_matches_last_day: async () => getRedisCountDay(redis, 'parser'),
    parse_fails_last_day: async () => getRedisCountDay(redis, 'parser_fail'),
    meta_parsed_last_day: async () => getRedisCountDay(redis, 'meta_parse'),
    reparse_last_day: async () => getRedisCountDay(redis, 'reparse'),
    regcdata_last_day: async () => getRedisCountDay(redis, 'regcdata'),
    requests_last_day: async () => getRedisCountDay(redis, 'request'),
    requests_api_key_last_day: async () =>
      getRedisCountDay(redis, 'request_api_key'),
    gen_api_key_invalid_last_day: async () =>
      getRedisCountDay(redis, 'gen_api_key_invalid'),
    steam_api_calls_last_day: async () =>
      getRedisCountDay(redis, 'steam_api_call'),
    steam_api_backfill_last_day: async () =>
      getRedisCountDay(redis, 'steam_api_backfill'),
    steam_gc_backfill_last_day: async() =>
      getRedisCountDay(redis, 'steam_gc_backfill'),
    match_archive_read_last_day: async () =>
      getRedisCountDay(redis, 'match_archive_read'),
    match_archive_write_last_day: async () =>
      getRedisCountDay(redis, 'match_archive_write'),
    incomplete_archive_last_day: async () =>
      getRedisCountDay(redis, 'incomplete_archive'),
    build_match_last_day: async () => getRedisCountDay(redis, 'build_match'),
    error_last_day: async () => getRedisCountDay(redis, '500_error'),
    web_crash_last_day: async () => getRedisCountDay(redis, 'web_crash'),
    fullhistory_last_day: async () => getRedisCountDay(redis, 'fullhistory'),
    skip_seq_num_last_day: async () => getRedisCountDay(redis, 'skip_seq_num'),
    api_hits_last_day: async () => getRedisCountDay(redis, 'api_hits'),
    api_hits_ui_last_day: async () => getRedisCountDay(redis, 'api_hits_ui'),
    scanner_exception_last_day: async () =>
      getRedisCountDay(redis, 'scanner_exception'),
    seqNumDelay: async () => {
      // It's slow to query Steam API so use the value saved by monitor
      const data = await redis.hget('health', 'seqNumDelay');
      return data ? JSON.parse(data)?.metric : null;
    },
    parseQueue: async () => {
      // It's slow to count in postgres so use the value saved by monitor
      const data = await redis.hget('health', 'parseDelay');
      return data ? JSON.parse(data)?.metric : null;
    },
    fhQueue: async () => redis.llen('fhQueue'),
    gcQueue: async () => redis.llen('gcQueue'),
    mmrQueue: async () => redis.llen('mmrQueue'),
    countsQueue: async () => redis.llen('countsQueue'),
    scenariosQueue: async () => redis.llen('scenariosQueue'),
    benchmarksQueue: async () => redis.llen('parsedBenchmarksQueue'),
    retriever: async () => {
      const results = await redis.zrangebyscore(
        'retrieverCounts',
        '-inf',
        'inf',
        'WITHSCORES',
      );
      const response: any[] = [];
      results?.forEach((result, i) => {
        if (i % 2 === 0) {
          response.push({
            hostname: result.split('.')[0],
            count: results[i + 1],
          });
        }
      });
      return response;
    },
    api_paths: async () => {
      const results = await redis.zrangebyscore(
        'api_paths',
        '-inf',
        'inf',
        'WITHSCORES',
      );
      const response: any[] = [];
      results?.forEach((result, i) => {
        if (i % 2 === 0) {
          response.push({
            hostname: result.split('.')[0],
            count: results[i + 1],
          });
        }
      });
      return response;
    },
    load_times: async () => {
      const arr = await redis.lrange('load_times', 0, -1);
      return generatePercentiles(arr ?? []);
    },
    health: async () => {
      const result = await redis.hgetall('health');
      const response = result || {};
      Object.keys(response).forEach((key) => {
        response[key] = JSON.parse(response[key]);
      });
      return response;
    },
  };
  return parallelPromise<{
    [P in keyof typeof obj]: Awaited<ReturnType<(typeof obj)[P]>>;
  }>(obj);
}
