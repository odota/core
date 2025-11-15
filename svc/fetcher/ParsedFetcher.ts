import { getRandomParserUrl, redisCount } from '../util/utility.ts';
import { blobArchive } from '../store/archive.ts';
import db from '../store/db.ts';
import { insertMatch } from '../util/insert.ts';
import axios from 'axios';
import { MatchFetcherBase } from './MatchFetcherBase.ts';
import config from '../../config.ts';

export class ParsedFetcher extends MatchFetcherBase<ParsedData> {
  savedDataMetricName: MetricName = 'reparse';
  useSavedData = Boolean(config.DISABLE_REPARSE);
  getData = async (matchId: number): Promise<ParsedData | null> => {
    const isAvailable = await this.checkAvailable(matchId);
    if (!isAvailable) {
      return null;
    }
    let data = null;
    const archive = await blobArchive.archiveGet(`${matchId}_parsed`);
    data = archive ? (JSON.parse(archive.toString()) as ParsedData) : null;
    return data;
  };
  fetchData = async (
    matchId: number,
    { leagueid, start_time, duration, origin, pgroup, url }: ParseExtraData,
  ) => {
    try {
      // Make a HEAD request for the replay to see if it's available
      await axios.head(url, { timeout: 10000 });
    } catch (e) {
      if (axios.isAxiosError(e)) {
        console.log(e.message);
      }
      return { data: null, error: 'Replay not found' };
    }

    // Pipelined for efficiency, but timings:
    // DL: 2967ms (curl http://replay152.valve.net/570/7503212404_1277518156.dem.bz2)
    // bunzip: 6716ms (bunzip2 7503212404_1277518156.dem.bz2)
    // parse: 9407ms (curl -X POST --data-binary "@7503212404_1277518156.dem" odota-parser:5600 > output.log)
    // process: 3278ms (node processors/createParsedDataBlob.mjs < output.log)
    const parseUrl = await getRandomParserUrl(`/blob?replay_url=${url}`);
    console.log('[PARSER]', parseUrl);
    const resp = await axios.get<ParsedData>(parseUrl, { timeout: 150000 });
    if (!resp.data) {
      return { data: null, error: 'Parse failed' };
    }
    const result: ParsedData = {
      ...resp.data,
      match_id: matchId,
      leagueid,
      // start_time and duration used for calculating dust adjustments and APM
      start_time,
      duration,
    };
    await insertMatch(result, {
      type: 'parsed',
      origin,
      pgroup,
      endedAt: start_time + duration,
    });
    return { data: result, error: null };
  };
  checkAvailable = async (matchId: number) => {
    return Boolean(
      (
        await db.raw('select match_id from parsed_matches where match_id = ?', [
          matchId,
        ])
      ).rows[0],
    );
  };
}
