import moment from 'moment';
import redis from '../store/redis';
import { parallelPromise } from '../util/utility';
import constants from 'dotaconstants';

function generatePercentiles(arr: string[]) {
  // sort the list
  arr.sort((a, b) => Number(a) - Number(b));
  // console.log(arr);
  const percentiles = [50, 75, 90, 95, 99];
  const result: Record<string, number> = {};
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
    // Health uses a custom shape, everything else is a Record<string, number>
    health: async (): Promise<Record<string, any>> => {
      const result = await redis.get('health:v2');
      return result ? JSON.parse(result) : null;
    },
    counts: async (): Promise<Record<string, number>> => {
      const counts = {
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
        slow_api_last_day: async () => countDay('slow_api_hit'),
        build_match_last_day: async () => countDay('build_match'),
        match_0_last_day: async () => countDay('0_match_req' as MetricName),
        match_1_last_day: async () => countDay('1_match_req' as MetricName),
        match_2_last_day: async () => countDay('2_match_req' as MetricName),
        match_3_last_day: async () => countDay('3_match_req' as MetricName),
        match_4_last_day: async () => countDay('4_match_req' as MetricName),
        match_5_last_day: async () => countDay('5_match_req' as MetricName),
        match_6_last_day: async () => countDay('6_match_req' as MetricName),
        match_7_last_day: async () => countDay('7_match_req' as MetricName),
        match_8_last_day: async () => countDay('8_match_req' as MetricName),
        match_9_last_day: async () => countDay('9_match_req' as MetricName),
        get_player_matches_last_day: async () => countDay('player_matches'),
        // self_player_matches_last_day: async () => countDay('self_profile_view'),

        api_cassandra_read_last_day: async () => countDay('api_cassandra_read'),
        gcdata_cassandra_read_last_day: async () =>
          countDay('gcdata_cassandra_read'),
        parsed_cassandra_read_last_day: async () =>
          countDay('parsed_cassandra_read'),
        blob_archive_read_last_day: async () => countDay('blob_archive_read'),
        match_archive_read_last_day: async () => countDay('match_archive_read'),
        archive_hit_last_day: async () => countDay('archive_hit'),
        archive_miss_last_day: async () => countDay('archive_miss'),
        archive_write_bytes_last_day: async () =>
          countDay('archive_write_bytes'),
        // incomplete_archive_last_day: async () => countDay('incomplete_archive'),

        // user_players: async () => redis.zcard('visitors'),
        // user_players_recent: async () =>
        //   redis.zcount(
        //     'visitors',
        //     moment().subtract(30, 'day').format('X'),
        //     '+inf',
        //   ),
        // distinct_match_players_last_day: async () =>
        //   countDayDistinct('distinct_match_player'),
        // distinct_match_players_user_last_day: async () =>
        //   countDayDistinct('distinct_match_player_user'),
        // distinct_match_players_recent_user_last_day: async () =>
        //   countDayDistinct('distinct_match_player_recent_user'),

        match_cache_hit_last_day: async () => countDay('match_cache_hit'),
        player_temp_hit_last_day: async () => countDay('player_temp_hit'),
        player_temp_miss_last_day: async () => countDay('player_temp_miss'),
        player_temp_skip_last_day: async () => countDay('player_temp_skip'),
        player_temp_wait_last_day: async () => countDay('player_temp_wait'),
        player_temp_write_last_day: async () => countDay('player_temp_write'),
        player_temp_write_bytes_last_day: async () =>
          countDay('player_temp_write_bytes'),
        distinct_player_temp_read_last_day: async () =>
          countDayDistinct('distinct_player_temp'),
        auto_player_temp_last_day: async () => countDay('auto_player_temp'),
        distinct_auto_player_temp_last_day: async () =>
          countDayDistinct('distinct_auto_player_temp'),

        // reapi_last_day: async () => countDay('reapi'),
        regcdata_last_day: async () => countDay('regcdata'),
        reparse_last_day: async () => countDay('reparse'),
        reparse_early_last_day: async () => countDay('reparse_early'),
        // oldparse_last_day: async () => countDay('oldparse'),

        error_last_day: async () => countDay('500_error'),
        web_crash_last_day: async () => countDay('web_crash'),
        secondary_scanner_last_day: async () => countDay('secondary_scanner'),
        steam_api_backfill_last_day: async () => countDay('steam_api_backfill'),
        // skip_seq_num_last_day: async () => countDay('skip_seq_num'),
        // gen_api_key_invalid_last_day: async () => getRedisCountDay('gen_api_key_invalid'),
      };
      return parallelPromise<Record<string, number>>(counts);
    },
    api_paths: async (): Promise<Record<string, number>> => {
      const results = await redis.zrangebyscore(
        'api_paths',
        '-inf',
        'inf',
        'WITHSCORES',
      );
      const response: Record<string, number> = {};
      results?.forEach((result, i) => {
        if (i % 2 === 0) {
          response[result.split('.')[0]] = Number(results[i + 1]);
        }
      });
      return response;
    },
    api_status: async (): Promise<Record<string, number>> => {
      const results = await redis.zrangebyscore(
        'api_status',
        '-inf',
        'inf',
        'WITHSCORES',
      );
      const response: Record<string, number> = {};
      results?.forEach((result, i) => {
        if (i % 2 === 0) {
          response[result.split('.')[0]] = Number(results[i + 1]);
        }
      });
      return response;
    },
    load_times: async (): Promise<Record<string, number>> => {
      const arr = await redis.lrange('load_times', 0, -1);
      return generatePercentiles(arr ?? []);
    },
    game_mode: async (): Promise<Record<string, number>> => {
      const result: Record<string, number> = {};
      const keys = Object.keys(constants.game_mode);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        result[constants.game_mode[key]?.name] = Number(await countDay(`${key}_game_mode` as MetricName));
      }
      return result;
    },
    lobby_type: async (): Promise<Record<string, number>> => {
      const result: Record<string, number> = {};
      const keys = Object.keys(constants.lobby_type);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        result[constants.lobby_type[key]?.name] = Number(await countDay(`${key}_lobby_type` as MetricName));
      }
      return result;
    },
    cluster: async (): Promise<Record<string, number>> => {
      const result: Record<string, number> = {};
      const keys = Object.keys(constants.cluster);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        result[key] = Number(await countDay(`${key}_cluster` as MetricName));
      }
      return result;
    },
  };
  return parallelPromise<{
    [P in keyof typeof obj]: Awaited<ReturnType<(typeof obj)[P]>>;
  }>(obj);
}
