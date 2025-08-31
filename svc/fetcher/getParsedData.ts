import config from '../../config.ts';
import { getRandomParserUrl, redisCount } from '../util/utility.ts';
import { blobArchive } from '../store/archive.ts';
import db from '../store/db.ts';
import { insertMatch } from '../util/insert.ts';
import axios from 'axios';
import { MatchFetcher } from './base.ts';

/**
 * Return parse data by reading it without fetching.
 * @param matchId
 * @returns
 */
async function readParsedData(matchId: number): Promise<ParserMatch | null> {
  let data = null;
  const archive = await blobArchive.archiveGet(`${matchId}_parsed`);
  if (archive) {
    redisCount('blob_archive_read');
  }
  data = archive ? (JSON.parse(archive.toString()) as ParserMatch) : null;
  return data;
}

/**
 * Requests parse data and saves it locally
 * @param matchId
 * @param replayUrl
 * @returns
 */
async function fetchParseData(
  matchId: number,
  { leagueid, start_time, duration, origin, pgroup, url }: ParseExtraData,
): Promise<{ error: string | null }> {
  try {
    // Make a HEAD request for the replay to see if it's available
    await axios.head(url, { timeout: 10000 });
  } catch (e) {
    if (axios.isAxiosError(e)) {
      console.log(e.message);
    }
    return { error: 'Replay not found' };
  }

  // Pipelined for efficiency, but timings:
  // DL: 2967ms (curl http://replay152.valve.net/570/7503212404_1277518156.dem.bz2)
  // bunzip: 6716ms (bunzip2 7503212404_1277518156.dem.bz2)
  // parse: 9407ms (curl -X POST --data-binary "@7503212404_1277518156.dem" odota-parser:5600 > output.log)
  // process: 3278ms (node processors/createParsedDataBlob.mjs < output.log)
  const parseUrl = await getRandomParserUrl(`/blob?replay_url=${url}`);
  console.log('[PARSER]', parseUrl);
  const resp = await axios.get<ParserMatch>(parseUrl, { timeout: 150000 });
  if (!resp.data) {
    return { error: 'Parse failed' };
  }
  const result: ParserMatch = {
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
  return { error: null };
}

async function getOrFetchParseData(
  matchId: number,
  extraData: ParseExtraData,
): Promise<{
  data: ParserMatch | null;
  skipped: boolean;
  error: string | null;
}> {
  const saved = await readParsedData(matchId);
  if (saved) {
    redisCount('reparse');
    if (config.DISABLE_REPARSE) {
      // If high load, we can disable parsing already parsed matches
      return { data: saved, skipped: true, error: null };
    }
  }
  const { error } = await fetchParseData(matchId, extraData);
  if (error) {
    return { data: null, skipped: false, error };
  }
  // We don't actually need the readback right now, so save some work
  // const result = await readParseData(matchId);
  // if (!result) {
  //   throw new Error('[PARSEDATA]: Could not get data for match ' + matchId);
  // }
  return { data: null, skipped: false, error };
}

class ParsedFetcher extends MatchFetcher<ParserMatch> {
  readData = readParsedData;
  getOrFetchData = getOrFetchParseData;
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

export const parsedFetcher = new ParsedFetcher();
