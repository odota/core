import moment from 'moment';
import redis from '../store/redis';
import { parallelPromise } from '../util/utility';

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

async function countDay(prefix: MetricName) {
  // Get counts for last 24 hour keys (including current partial hour)
  const keyArr = [];
  for (let i = 0; i < 24; i += 1) {
    keyArr.push(
      `${prefix}:v2:${moment()
        .startOf('hour')
        .subtract(i, 'hour')
        .format('X')}`,
    );
  }
  const counts = await redis.mget(...keyArr);
  return counts.reduce((a, b) => Number(a) + Number(b), 0);
}

async function countHour(prefix: MetricName) {
  const result = await redis.get(
    `${prefix}:v2:${moment().startOf('hour').format('X')}`,
  );
  return Number(result);
}

async function countLastHour(prefix: MetricName) {
  // Get counts for previous full hour (not current)
  const result = await redis.get(
    `${prefix}:v2:${moment().startOf('hour').subtract(1, 'hour').format('X')}`,
  );
  return Number(result);
}

async function countDayDistinct(prefix: MetricName) {
  // Get counts for last 24 hour keys (including current partial hour)
  const keyArr = [];
  for (let i = 0; i < 24; i += 1) {
    keyArr.push(
      `${prefix}:v2:${moment()
        .startOf('hour')
        .subtract(i, 'hour')
        .format('X')}`,
    );
  }
  return redis.pfcount(...keyArr);
}

export async function buildStatus() {
  const obj = {  
    registry_proxy: async () => redis.zcard('registry:proxy'),
    registry_retriever: async () => redis.zcard('registry:retriever'),
    registry_parser: async () => redis.zcard('registry:parser'),

    matches_last_day: async () => countDay('added_match'),
    matches_prev_hour: async () => countLastHour('added_match'),
    retriever_matches_last_day: async () => countDay('retriever'),
    parsed_matches_last_day: async () => countDay('parser'),
    tracked_players: async () => redis.zcard('tracked'),
    auto_parse_last_day: async () => countDay('auto_parse'),

    retriever_matches_current_hour: async () => countHour('retriever'),
    retriever_players_last_day: async () => countDay('retriever_player'),
    parse_jobs_last_day: async () => countDay('parser_job'),
    parse_fails_last_day: async () => countDay('parser_fail'),
    parse_crashes_last_day: async () => countDay('parser_crash'),
    parse_skips_last_day: async () => countDay('parser_skip'),

    requests_last_day: async () => countDay('request'),
    distinct_requests_last_day: async () =>
      countDayDistinct('distinct_request'),
    requests_ui_day: async () => countDay('request_ui'),
    requests_api_key_last_day: async () => countDay('request_api_key'),
    fullhistory_last_day: async () => countDay('fullhistory'),
    fullhistory_short_last_day: async () => countDay('fullhistory_short'),
    fullhistory_ops_last_day: async () => countDay('fullhistory_op'),
    fullhistory_skips_last_day: async () => countDay('fullhistory_skip'),
    meta_parsed_last_day: async () => countDay('meta_parse'),

    steam_api_calls_last_day: async () => countDay('steam_api_call'),
    steam_proxy_calls_last_day: async () => countDay('steam_proxy_call'),
    steam_429_last_day: async () => countDay('steam_429'),
    steam_403_last_day: async () => countDay('steam_403'),
    // steam_api_notfound_last_day: async () => countDay('steam_api_notfound'),
    // steam_gc_backfill_last_day: async () => countDay('steam_gc_backfill'),
  
    api_hits_last_day: async () => countDay('api_hits'),
    api_hits_ui_last_day: async () => countDay('api_hits_ui'),
    build_match_last_day: async () => countDay('build_match'),
    get_player_matches_last_day: async () => countDay('player_matches'),
    // self_player_matches_last_day: async () => countDay('self_profile_view'),

    blob_archive_read_last_day: async () => countDay('blob_archive_read'),
    match_archive_read_last_day: async () => countDay('match_archive_read'),
    match_archive_write_last_day: async () => countDay('match_archive_write'),
    incomplete_archive_last_day: async () => countDay('incomplete_archive'),

    error_last_day: async () => countDay('500_error'),
    web_crash_last_day: async () => countDay('web_crash'),
    skip_seq_num_last_day: async () => countDay('skip_seq_num'),
    secondary_scanner_last_day: async () => countDay('secondary_scanner'),
    steam_api_backfill_last_day: async () => countDay('steam_api_backfill'),
    // gen_api_key_invalid_last_day: async () => getRedisCountDay('gen_api_key_invalid'),

    user_players: async () => redis.zcard('visitors'),
    user_players_recent: async () =>
      redis.zcount(
        'visitors',
        moment().subtract(30, 'day').format('X'),
        '+inf',
      ),
    distinct_match_players_last_day: async () =>
      countDayDistinct('distinct_match_player'),
    distinct_match_players_user_last_day: async () =>
      countDayDistinct('distinct_match_player_user'),
    distinct_match_players_recent_user_last_day: async () =>
      countDayDistinct('distinct_match_player_recent_user'),
    
    match_cache_hit_last_day: async () => countDay('match_cache_hit'),
    player_cache_hit_last_day: async () => countDay('player_cache_hit'),
    player_cache_miss_last_day: async () => countDay('player_cache_miss'),
    player_cache_wait_last_day: async () => countDay('player_cache_wait'),
    player_cache_write_last_day: async () => countDay('player_cache_write'),
    distinct_player_cache_last_day: async () =>
      countDayDistinct('distinct_player_cache'),
    auto_player_cache_hit_last_day: async () =>
      countDay('auto_player_cache_hit'),
    auto_player_cache_miss_last_day: async () =>
      countDay('auto_player_cache_miss'),
    auto_player_cache_last_day: async () => countDay('auto_player_cache'),
    distinct_auto_player_cache_last_day: async () =>
      countDayDistinct('distinct_auto_player_cache'),

    // reapi_last_day: async () => countDay('reapi'),
    regcdata_last_day: async () => countDay('regcdata'),
    reparse_last_day: async () => countDay('reparse'),
    reparse_early_last_day: async () => countDay('reparse_early'),
    // oldparse_last_day: async () => countDay('oldparse'),

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
    api_status: async () => {
      const results = await redis.zrangebyscore(
        'api_status',
        '-inf',
        'inf',
        'WITHSCORES',
      );
      const response: any[] = [];
      results?.forEach((result, i) => {
        if (i % 2 === 0) {
          response.push({
            status: result.split('.')[0],
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
      const result = await redis.get('health:v2');
      return result ? JSON.parse(result) : null;
    },
  };
  return parallelPromise<{
    [P in keyof typeof obj]: Awaited<ReturnType<(typeof obj)[P]>>;
  }>(obj);
}
