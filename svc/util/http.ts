import type { AxiosRequestConfig } from 'axios';
import config from '../../config.ts';
import redis, { redisCount, redisCountHash } from '../store/redis.ts';
import axios from 'axios';
import { convert32to64 } from './utility.ts';

const apiUrl = 'http://api.steampowered.com';
let apiKey = config.STEAM_API_KEY.split(',')[0];
export const SteamAPIUrls = {
  api_details: (payload: { match_id: string | number }) =>
    `${apiUrl}/IDOTA2Match_570/GetMatchDetails/V001/?key=${apiKey}&match_id=${payload.match_id}`,
  api_history: (payload: {
    account_id?: number;
    matches_requested?: number;
    hero_id?: number;
    leagueid?: number;
    start_at_match_id?: number;
  }) =>
    `${apiUrl}/IDOTA2Match_570/GetMatchHistory/V001/?key=${apiKey}${
      payload.account_id ? `&account_id=${payload.account_id}` : ''
    }${
      payload.matches_requested
        ? `&matches_requested=${payload.matches_requested}`
        : ''
    }${payload.hero_id ? `&hero_id=${payload.hero_id}` : ''}${
      payload.leagueid != null ? `&league_id=${payload.leagueid}` : ''
    }${
      payload.start_at_match_id
        ? `&start_at_match_id=${payload.start_at_match_id}`
        : ''
    }`,
  api_summaries: (payload: { steamids: string[] }) =>
    `${apiUrl}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${payload.steamids.join(',')}`,
  api_sequence: (payload: {
    start_at_match_seq_num: number;
    matches_requested: number;
  }) =>
    `${apiUrl}/IDOTA2Match_570/GetMatchHistoryBySequenceNum/V001/?key=${apiKey}&start_at_match_seq_num=${payload.start_at_match_seq_num}&matches_requested=${payload.matches_requested}`,
  api_heroes: (payload: { language: string }) =>
    `${apiUrl}/IEconDOTA2_570/GetHeroes/v0001/?key=${apiKey}&language=${payload.language}`,
  api_live: () =>
    `${apiUrl}/IDOTA2Match_570/GetLiveLeagueGames/v0001/?key=${apiKey}`,
  api_teams: (payload: { team_id: number }) =>
    `${apiUrl}/IDOTA2Teams_570/GetTeamInfo/v1/?key=${apiKey}&team_id=${payload.team_id}`,
  api_item_schema: () =>
    `${apiUrl}/IEconItems_570/GetSchemaURL/v1?key=${apiKey}`,
  api_top_live_game: (payload: { partner: number }) =>
    `${apiUrl}/IDOTA2Match_570/GetTopLiveGame/v1/?key=${apiKey}&partner=${payload.partner}`,
  api_realtime_stats: (payload: { server_steam_id: string }) =>
    `${apiUrl}/IDOTA2MatchStats_570/GetRealtimeStats/v1?key=${apiKey}&server_steam_id=${payload.server_steam_id}`,
  api_team_info_by_team_id: (payload: { start_at_team_id: number }) =>
    `${apiUrl}/IDOTA2Match_570/GetTeamInfoByTeamID/v1?key=${apiKey}&start_at_team_id=${payload.start_at_team_id}&teams_requested=1`,
  api_get_ugc_file_details: (payload: { ugcid: string | undefined }) =>
    `${apiUrl}/ISteamRemoteStorage/GetUGCFileDetails/v1/?key=${apiKey}&appid=570&ugcid=${payload.ugcid}`,
};

/**
 * A wrapper around HTTP requests that handles:
 * proxying
 * retries/retry delay
 * Injecting API key for Steam API
 * Errors from Steam API
 * */
type GetDataOptions = {
  url: string;
  timeout?: number;
  // Don't parse the response as JSON
  raw?: boolean;
  proxy?: boolean;
};
const apiKeys = config.STEAM_API_KEY.split(',');
export async function getSteamAPIData<T>(options: GetDataOptions): Promise<T> {
  let url = options.url;
  const parsedUrl = new URL(url);
  redisCountHash('steam_api_paths', parsedUrl.pathname);
  // choose an api key to use
  parsedUrl.searchParams.set(
    'key',
    apiKeys[Math.floor(Math.random() * apiKeys.length)],
  );
  if (options.proxy) {
    const apiHosts = await getApiHosts();
    // add the proxy hosts and select
    const hosts = ['api.steampowered.com', ...apiHosts];
    parsedUrl.host = hosts[Math.floor(Math.random() * hosts.length)];
  }
  if (parsedUrl.host === 'api.steampowered.com') {
    redisCount('steam_api_call');
  } else {
    redisCount('steam_proxy_call');
  }
  const target = parsedUrl.toString();
  const axiosOptions: AxiosRequestConfig = {
    timeout: options.timeout ?? 5000,
    headers: {
      'Content-Encoding': 'gzip',
    },
  };
  if (options.raw) {
    // Return string instead of JSON
    axiosOptions.responseType = 'text';
  }
  let body = null;
  const start = Date.now();
  try {
    // Throws an exception if we get a non-2xx status code
    const response = await axios.get(target, axiosOptions);
    body = response.data;
  } catch (err) {
    const end = Date.now();
    console.log('%s: %dms', target, end - start);
    if (axios.isAxiosError(err)) {
      const statusCode = err.response?.status;
      console.log('[EXCEPTION] %s, %s', statusCode, target);
      if (statusCode === 429) {
        redisCount('steam_429');
      } else if (statusCode === 403) {
        redisCount('steam_403');
      }
      if (statusCode === 429) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      throw new Error(
        '[EXCEPTION] status: ' + statusCode + ' message: ' + err.message,
      );
    } else {
      throw err;
    }
  }
  const end = Date.now();
  console.log('%s: %dms', target, end - start);
  if (options.raw) {
    return body;
  }
  // Validate the response, even if we got a successful result
  if (body.result) {
    // steam api usually returns data with body.result, getplayersummaries has body.response
    if (
      body.result.status === 15 ||
      body.result.error ===
        'Practice matches are not available via GetMatchDetails' ||
      body.result.error === 'No Match ID specified' ||
      body.result.error === 'Match ID not found' ||
      (body.result.status === 2 &&
        body.result.statusDetail === 'Error retrieving match data.')
    ) {
      // private match history or attempting to get practice match/invalid id, don't retry
      // These shouldn't be retried, so just return the response directly but we might want to incllude some metadata to tell the user it's not retryable
      console.log(
        '[INVALID] (non-retryable) %s, %s',
        target,
        JSON.stringify(body),
      );
      return body;
    }
    if (body.result.error || body.result.status === 2) {
      // this is invalid data but we can retry, so throw an exception and let the caller handle
      console.log('[INVALID] (retryable) %s, %s', target, JSON.stringify(body));
      throw new Error('invalid data (retryable)');
    }
  }
  return body;
}

export async function getSteamAPIDataWithRetry<T>(
  options: GetDataOptions,
): Promise<T> {
  let body;
  while (!body) {
    try {
      body = await getSteamAPIData<T>(options);
    } catch (err: any) {
      // Can retry on transient error
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return body;
}

/**
 * Return an array of hostnames to use for Steam API requests
 * @returns
 */
const staticHosts = config.STEAM_API_HOST.split(',');
async function getApiHosts(): Promise<string[]> {
  let additional: string[] = [];
  if (config.USE_SERVICE_REGISTRY) {
    // Purge values older than 10 seconds (stale heartbeat)
    await redis.zremrangebyscore(
      'registry:' + 'proxy',
      '-inf',
      Date.now() - 10000,
    );
    additional = await redis.zrange('registry:proxy', 0, -1);
  }
  return [...staticHosts, ...additional];
}
