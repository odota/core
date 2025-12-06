import type { AxiosResponse } from 'axios';
import db from '../store/db.ts';
import { getRandomRetrieverUrl } from '../util/utility.ts';
import axios from 'axios';
import { insertMatch } from '../util/insert.ts';
import { blobArchive } from '../store/archive.ts';
import { MatchFetcherBase } from './MatchFetcherBase.ts';
import config from '../../config.ts';
import { redisCount, redisCountHash } from '../store/redis.ts';

export class GcdataFetcher extends MatchFetcherBase<GcData> {
  savedDataMetricName: MetricName = 'regcdata';
  useSavedData = Boolean(config.DISABLE_REGCDATA);
  getData = async (matchId: number): Promise<GcData | null> => {
    let data = null;
    const archive = await blobArchive.archiveGet(`${matchId}_gcdata`);
    data = archive ? (JSON.parse(archive.toString()) as GcData) : null;
    // Verify data integrity
    if (
      data?.match_id == null ||
      data?.cluster == null ||
      data?.replay_salt == null
    ) {
      return null;
    }
    return data;
  };
  fetchData = async (matchId: number, extraData: GcExtraData | null) => {
    const url = await getRandomRetrieverUrl(`/match/${matchId}`);
    let resp: AxiosResponse<RetrieverMatch>;
    try {
      resp = await axios.get<RetrieverMatch>(url, {
        timeout: 4000,
      });
    } catch (e) {
      // Non-2xx status (e.g. 429 too many requests or 500 server error)
      let message = '';
      if (axios.isAxiosError(e)) {
        message = e.message;
      }
      console.log(url, message);
      return { data: null, error: 'axiosError: ' + message, retryable: true };
    }
    console.log(url, resp.status);
    const { data, headers } = resp;
    const steamid = headers['x-match-request-steamid'];
    const ip = headers['x-match-request-ip'];
    // Record the total steamids and ip counts from headers (sent with 204 response even if request timed out)
    redisCountHash('retrieverSteamIDs', steamid);
    redisCountHash('retrieverIPs', ip);
    if (headers['x-match-noretry']) {
      // Steam is blocking this match for community prediction, so return error to prevent retry
      return { error: 'x-match-noretry', data: null };
    }
    if (data.match.game_mode === 'DOTA_GAMEMODE_NONE') {
      // Really old matches have a 0 replay salt so if we don't have gamemode stop retrying
      return {
        error: 'extremely old GC response format without replay salt',
        data: null,
      };
    }
    if (data.result === 2) {
      // Match not found, don't retry
      return {
        error: 'Match ID not found',
        data: null,
      };
    }
    if (!data?.match?.replay_salt) {
      // Response doesn't have replay data, try again
      return { error: 'invalid data', data: null, retryable: true };
    }
    // Count successful calls
    redisCount('retriever');
    redisCountHash('retrieverSuccessSteamIDs', steamid);
    redisCountHash('retrieverSuccessIPs', ip);
    // Some old matches don't have players, e.g. 271601114
    // They still have a replay salt so we can continue
    const gcPlayers = data.match.players ?? [];
    const players = gcPlayers.map(
      (p: any, i: number): GcPlayer => ({
        // NOTE: account ids are not anonymous in this call
        account_id: p.account_id,
        player_slot: p.player_slot,
        party_id: Number(p.party_id),
        permanent_buffs: p.permanent_buffs ?? [],
        party_size: gcPlayers.filter(
          (matchPlayer: any) =>
            Number(matchPlayer.party_id) === Number(p.party_id),
        ).length,
      }),
    );
    const matchToInsert: GcData = {
      match_id: matchId,
      players,
      series_id: data.match.series_id,
      series_type: data.match.series_type,
      // With match_id, cluster, and replay salt we can construct a replay URL
      cluster: data.match.cluster,
      replay_salt: data.match.replay_salt,
    };

    // Update series id and type for pro match
    await db.raw(
      'UPDATE matches SET series_id = ?, series_type = ?, cluster = ?, replay_salt = ? WHERE match_id = ?',
      [
        matchToInsert.series_id,
        matchToInsert.series_type,
        matchToInsert.cluster,
        matchToInsert.replay_salt,
        matchId,
      ],
    );
    const endedAt = data.match.starttime + data.match.duration;

    if (extraData) {
      await insertMatch(matchToInsert, {
        type: 'gcdata',
        pgroup: extraData.pgroup,
        origin: extraData.origin,
        endedAt,
      });
    }
    return { data: matchToInsert, error: null, endedAt };
  };
  checkAvailable = async (matchId: number) => {
    throw new Error('not implemented');
  };
}
