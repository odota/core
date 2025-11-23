import moment from 'moment';
import db from '../store/db.ts';
import redis, {
  getRedisCountDay,
  getRedisCountDayDistinct,
  getRedisCountDayHash,
  getRedisCountLastHour,
} from '../store/redis.ts';
import { parallelPromise } from './utility.ts';
import { game_mode, lobby_type, region, cluster } from 'dotaconstants';
import axios from 'axios';

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

const isGce = (e: { key: string }) =>
  e.key.startsWith('35.') || e.key.startsWith('34.');

export async function buildStatus(isAdmin: boolean) {
  const [idReqs, ipReqs, idSuccess, ipSuccess] = await Promise.all([
    getRedisCountDayHash('retrieverSteamIDs'),
    getRedisCountDayHash('retrieverIPs'),
    getRedisCountDayHash('retrieverSuccessSteamIDs'),
    getRedisCountDayHash('retrieverSuccessIPs'),
  ]);
  const steamids = Object.keys(idReqs)
    .map((key) => {
      return {
        key,
        reqs: idReqs[key] || 0,
        success: idSuccess[key] || 0,
      };
    })
    .sort((a, b) => b.reqs - a.reqs);
  const ips = Object.keys(ipReqs)
    .map((key) => {
      return {
        key,
        reqs: ipReqs[key] || 0,
        success: ipSuccess[key] || 0,
      };
    })
    .sort((a, b) => b.reqs - a.reqs);

  const obj: Record<string, () => Promise<Record<string, number | Metric>>> = {
    health: async () => {
      const result = await redis.get('health:v2');
      return JSON.parse(result ?? '{}');
    },
    counts: async () => {
      const counts = {
        registry_proxy: async () => redis.zcard('registry:proxy'),
        registry_retriever: async () => redis.zcard('registry:retriever'),
        registry_parser: async () => redis.zcard('registry:parser'),

        matches_last_day: async () => getRedisCountDay('added_match'),
        matches_prev_hour: async () => getRedisCountLastHour('added_match'),
        retriever_players_last_day: async () =>
          getRedisCountDay('retriever_player'),
        retriever_matches_last_day: async () => getRedisCountDay('retriever'),
        // retriever_matches_current_hour: async () => countHour('retriever'),
        parsed_matches_last_day: async () => getRedisCountDay('parser'),
        gcdata_matches_last_day: async () => getRedisCountDay('gcdata'),
        rated_matches_last_day: async () => getRedisCountDay('rater'),
        rated_skip_last_day: async () => getRedisCountDay('rater_skip'),
        scenario_last_day: async () => getRedisCountDay('scenario'),
        profiler_last_day: async () => getRedisCountDay('profiler'),
        player_discover_last_day: async () =>
          getRedisCountDay('player_discover'),
        fullhistory_last_day: async () => getRedisCountDay('fullhistory'),
        fullhistory_skips_last_day: async () =>
          getRedisCountDay('fullhistory_skip'),
        pmh_fullhistory_last_day: async () =>
          getRedisCountDay('pmh_fullhistory'),
        pmh_gcdata_last_day: async () => getRedisCountDay('pmh_gcdata'),
        pmh_parsed_last_day: async () => getRedisCountDay('pmh_parsed'),
        reconcile_last_day: async () => getRedisCountDay('reconcile'),
        requests_last_day: async () => getRedisCountDay('request'),
        distinct_requests_last_day: async () =>
          getRedisCountDayDistinct('distinct_request'),
        requests_ui_last_day: async () => getRedisCountDay('request_ui'),
        requests_api_key_last_day: async () =>
          getRedisCountDay('request_api_key'),
        request_api_fail_last_day: async () =>
          getRedisCountDay('request_api_fail'),
        tracked_players: async () => redis.zcard('tracked'),
        auto_parse_last_day: async () => getRedisCountDay('auto_parse'),
        meta_parsed_last_day: async () => getRedisCountDay('meta_parse'),

        parse_jobs_last_day: async () => getRedisCountDay('parser_job'),
        parse_fails_last_day: async () => getRedisCountDay('parser_fail'),
        parse_crashes_last_day: async () => getRedisCountDay('parser_crash'),
        parse_skips_last_day: async () => getRedisCountDay('parser_skip'),
        // reapi_last_day: async () => countDay('reapi'),
        regcdata_last_day: async () => getRedisCountDay('regcdata'),
        reparse_last_day: async () => getRedisCountDay('reparse'),
        // oldparse_last_day: async () => countDay('oldparse'),

        steam_api_calls_last_day: async () =>
          getRedisCountDay('steam_api_call'),
        steam_proxy_calls_last_day: async () =>
          getRedisCountDay('steam_proxy_call'),
        steam_429_last_day: async () => getRedisCountDay('steam_429'),
        steam_403_last_day: async () => getRedisCountDay('steam_403'),
        steam_api_backfill_last_day: async () =>
          getRedisCountDay('steam_api_backfill'),
        // steam_api_notfound_last_day: async () => countDay('steam_api_notfound'),
        // steam_gc_backfill_last_day: async () => countDay('steam_gc_backfill'),
        backfill_success_last_day: async () =>
          getRedisCountDay('backfill_success'),
        backfill_fail_last_day: async () => getRedisCountDay('backfill_fail'),
        backfill_skip_last_day: async () => getRedisCountDay('backfill_skip'),
        backfill_page_back_last_day: async () =>
          getRedisCountDay('backfill_page_back'),

        api_hits_last_day: async () => getRedisCountDay('api_hits'),
        api_hits_ui_last_day: async () => getRedisCountDay('api_hits_ui'),
        slow_api_last_day: async () => getRedisCountDay('slow_api_hit'),
        build_match_last_day: async () => getRedisCountDay('build_match'),
        // match_0_last_day: async () => countDay('0_match_req' as MetricName),
        // match_1_last_day: async () => countDay('1_match_req' as MetricName),
        // match_2_last_day: async () => countDay('2_match_req' as MetricName),
        // match_3_last_day: async () => countDay('3_match_req' as MetricName),
        // match_4_last_day: async () => countDay('4_match_req' as MetricName),
        // match_5_last_day: async () => countDay('5_match_req' as MetricName),
        // match_6_last_day: async () => countDay('6_match_req' as MetricName),
        // match_7_last_day: async () => countDay('7_match_req' as MetricName),
        // match_8_last_day: async () => countDay('8_match_req' as MetricName),
        // match_9_last_day: async () => countDay('9_match_req' as MetricName),
        get_player_matches_last_day: async () =>
          getRedisCountDay('player_matches'),
        // self_player_matches_last_day: async () => countDay('self_profile_view'),

        match_archive_read_last_day: async () =>
          getRedisCountDay('match_archive_read'),
        cache_api_hit_last_day: async () => getRedisCountDay('cache_api_hit'),
        cache_gcdata_hit_last_day: async () =>
          getRedisCountDay('cache_gcdata_hit'),
        cache_parsed_hit_last_day: async () =>
          getRedisCountDay('cache_parsed_hit'),
        archive_hit_last_day: async () => getRedisCountDay('archive_hit'),
        archive_miss_last_day: async () => getRedisCountDay('archive_miss'),
        archive_read_bytes_last_day: async () =>
          getRedisCountDay('archive_read_bytes'),
        archive_write_bytes_last_day: async () =>
          getRedisCountDay('archive_write_bytes'),
        archive_get_error_last_day: async () =>
          getRedisCountDay('archive_get_error'),
        archive_put_error_last_day: async () =>
          getRedisCountDay('archive_put_error'),
        // incomplete_archive_last_day: async () => countDay('incomplete_archive'),

        // user_players: async () => redis.zcard('visitors'),
        // user_players_recent: async () =>
        //   redis.zcount(
        //     'visitors',
        //     moment.utc().subtract(30, 'day').format('X'),
        //     '+inf',
        //   ),
        // distinct_match_players_last_day: async () =>
        //   countDayDistinct('distinct_match_player'),
        // distinct_match_players_user_last_day: async () =>
        //   countDayDistinct('distinct_match_player_user'),
        // distinct_match_players_recent_user_last_day: async () =>
        //   countDayDistinct('distinct_match_player_recent_user'),

        match_cache_hit_last_day: async () =>
          getRedisCountDay('match_cache_hit'),
        // player_temp_hit_last_day: async () => countDay('player_temp_hit'),
        // player_temp_miss_last_day: async () => countDay('player_temp_miss'),
        // player_temp_skip_last_day: async () => countDay('player_temp_skip'),
        // player_temp_wait_last_day: async () => countDay('player_temp_wait'),
        // player_temp_write_last_day: async () => countDay('player_temp_write'),
        // player_temp_write_bytes_last_day: async () =>
        //   countDay('player_temp_write_bytes'),
        // distinct_player_temp_read_last_day: async () =>
        //   countDayDistinct('distinct_player_temp'),
        // auto_player_temp_last_day: async () => countDay('auto_player_temp'),
        // distinct_auto_player_temp_last_day: async () =>
        //   countDayDistinct('distinct_auto_player_temp'),

        error_last_day: async () => getRedisCountDay('500_error'),
        web_crash_last_day: async () => getRedisCountDay('web_crash'),
        secondary_scanner_last_day: async () =>
          getRedisCountDay('secondary_scanner'),
        skip_seq_num_last_day: async () => getRedisCountDay('skip_seq_num'),
      };
      return parallelPromise<Record<string, number>>(counts);
    },
    api_paths: async () => {
      const result = await getRedisCountDayHash('api_paths');
      const sorted = Object.entries(result).sort((a, b) => b[1] - a[1]);
      const final: Record<string, number> = {};
      sorted.forEach(([k, v]) => {
        final[k] = v;
      });
      return final;
    },
    api_status: async () => {
      const result = await getRedisCountDayHash('api_status');
      // Sorting won't do anything here because JS always puts numeric keys in numeric order
      return result;
    },
    load_times: async () => {
      const arr = await redis.lrange('load_times', 0, -1);
      return generatePercentiles(arr ?? []);
    },
    steam_api_paths: async () => {
      const result = await getRedisCountDayHash('steam_api_paths');
      const sorted = Object.entries(result).sort((a, b) => b[1] - a[1]);
      const final: Record<string, number> = {};
      sorted.forEach(([k, v]) => {
        final[k] = v;
      });
      return final;
    },
    retrieverCounts: async () => {
      if (isAdmin) {
        return {
          countReqs: ips.map((e) => e.reqs).reduce((a, b) => a + b, 0),
          countSuccess: ips.map((e) => e.success).reduce((a, b) => a + b, 0),
          gceReqs: ips
            .filter((e) => isGce(e))
            .map((e) => e.reqs)
            .reduce((a, b) => a + b, 0),
          gceSuccess: ips
            .filter((e) => isGce(e))
            .map((e) => e.success)
            .reduce((a, b) => a + b, 0),
          nonGceReqs: ips
            .filter((e) => !isGce(e))
            .map((e) => e.reqs)
            .reduce((a, b) => a + b, 0),
          nonGceSuccess: ips
            .filter((e) => !isGce(e))
            .map((e) => e.success)
            .reduce((a, b) => a + b, 0),
          numIps: ips.length,
          gceIps: ips.filter((e) => isGce(e)).length,
          nonGceIps: ips.filter((e) => !isGce(e)).length,
          numSteamIds: steamids.length,
        };
      }
      return {} as Record<string, number>;
    },
    retrieverRegistry: async () => {
      let retrieverRegistry: Record<string, Metric> = {};
      if (isAdmin) {
        const registryKeys = await redis.zrange('registry:retriever', 0, -1);
        const rows = await Promise.all(
          registryKeys.map(async (k) => {
            let json;
            try {
              const resp = await axios.get('http://' + k, { timeout: 1000 });
              json = resp.data;
            } catch (e) {
              console.log(e);
            }
            const found = ips.find((ip) => ip.key === k);
            return {
              key: k,
              metric: found?.success,
              limit: found?.reqs,
              ...json,
            };
          }),
        );
        rows.forEach((r) => {
          retrieverRegistry[r.key] = r;
        });
      }
      return retrieverRegistry;
    },
    retrieverIPs: async () => {
      let retrieverIPs: Record<string, Metric> = {};
      if (isAdmin) {
        ips.forEach((ip) => {
          retrieverIPs[ip.key] = {
            metric: ip.success,
            limit: ip.reqs,
          };
        });
      }
      return retrieverIPs;
    },
    retrieverSteamIDs: async () => {
      let retrieverSteamIDs: Record<string, Metric> = {};
      if (isAdmin) {
        steamids.forEach((steamid) => {
          retrieverSteamIDs[steamid.key] = {
            metric: steamid.success,
            limit: steamid.reqs,
          };
        });
      }
      return retrieverSteamIDs;
    },
    apiMetrics: async () => {
      let apiMetrics: Record<string, number> = {};
      if (isAdmin) {
        const startTime = moment.utc().startOf('month').format('YYYY-MM-DD');
        const endTime = moment.utc().endOf('month').format('YYYY-MM-DD');
        const { rows } = await db.raw(
          `
    SELECT
        account_id,
        ARRAY_AGG(DISTINCT api_key) as api_keys,
        SUM(usage) as usage_count
    FROM (
        SELECT
        account_id,
        api_key,
        ip,
        MAX(usage_count) as usage
        FROM api_key_usage
        WHERE
        timestamp >= ?
        AND timestamp <= ?
        GROUP BY account_id, api_key, ip
    ) as t1
    GROUP BY account_id
    ORDER BY usage_count DESC
    `,
          [startTime, endTime],
        );
        rows.forEach((r: any) => {
          apiMetrics[`id_${r.account_id}`] = Number(r.usage_count);
        });
      }
      return apiMetrics;
    },
    game_mode: async () => {
      const result: Record<string, number> = {};
      const keys = Object.keys(game_mode);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i] as keyof typeof game_mode;
        result[game_mode[key]?.name] = Number(
          await getRedisCountDay(`${key}_game_mode` as MetricName),
        );
      }
      return result;
    },
    lobby_type: async () => {
      const result: Record<string, number> = {};
      const keys = Object.keys(lobby_type);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i] as keyof typeof lobby_type;
        result[lobby_type[key]?.name] = Number(
          await getRedisCountDay(`${key}_lobby_type` as MetricName),
        );
      }
      return result;
    },
    region: async () => {
      const result: Record<string, number> = {};
      const clusters = Object.entries(cluster);
      for (let i = 0; i < clusters.length; i++) {
        const [cluster, reg] = clusters[i];
        const regName =
          region[reg as unknown as keyof typeof region] ?? cluster;
        result[regName] =
          (result[regName] ?? 0) +
          Number(await getRedisCountDay(`${cluster}_cluster` as MetricName));
      }
      return result;
    },
  };
  return parallelPromise<{
    [P in keyof typeof obj]: Awaited<ReturnType<(typeof obj)[P]>>;
  }>(obj);
}
