import config from '../config';
import { redisCount } from '../util/utility';
import cassandra from './cassandra';
import db from './db';
import { insertMatch } from './insert';
import redis from './redis';
import { promisify } from 'util';
import { exec } from 'child_process';
import axios from 'axios';

const { PARSER_HOST } = config;
const execPromise = promisify(exec);

/**
 * Return parse data by reading it without fetching.
 * @param matchId
 * @returns
 */
export async function readParseData(
  matchId: number,
): Promise<ParserMatch | undefined> {
  const result = await cassandra.execute(
    'SELECT parsed FROM match_blobs WHERE match_id = ?',
    [matchId],
    { prepare: true, fetchSize: 1, autoPage: true },
  );
  const row = result.rows[0];
  const data = row?.parsed
    ? (JSON.parse(row.parsed) as ParserMatch)
    : undefined;
  if (!data) {
    return;
  }
  return data;
}

type ExtraData = {
  leagueid: number;
  start_time: number;
  duration: number;
  origin?: DataOrigin;
  pgroup: PGroup;
};

/**
 * Requests parse data and saves it locally
 * @param matchId
 * @param url
 * @returns
 */
export async function saveParseData(
  matchId: number,
  url: string,
  { leagueid, start_time, duration, origin, pgroup }: ExtraData,
): Promise<string | null> {
  console.log('[PARSER] parsing replay at:', url);
  try {
    // Make a HEAD request for the replay to see if it's available
    await axios.head(url, { timeout: 5000 });
  } catch (e) {
    if (axios.isAxiosError(e)) {
      console.log(e.message);
    }
    return 'Replay not found';
  }

  // Pipelined for efficiency, but timings:
  // DL: 2967ms (curl http://replay152.valve.net/570/7503212404_1277518156.dem.bz2)
  // bunzip: 6716ms (bunzip2 7503212404_1277518156.dem.bz2)
  // parse: 9407ms (curl -X POST --data-binary "@7503212404_1277518156.dem" odota-parser:5600 > output.log)
  // process: 3278ms (node processors/createParsedDataBlob.mjs < output.log)
  try {
    const { stdout } = await execPromise(
      `curl --max-time 90 --fail -L ${url} | ${
        url && url.slice(-3) === 'bz2' ? 'bunzip2' : 'cat'
      } | curl -X POST -T - ${PARSER_HOST} | node processors/createParsedDataBlob.mjs ${matchId}`,
      //@ts-ignore
      { shell: true, maxBuffer: 10 * 1024 * 1024 },
    );

    const result: ParserMatch = {
      ...JSON.parse(stdout),
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
    return null;
  } catch(e: any) {
    if (e?.message?.includes('bunzip2: Data integrity error when decompressing')) {
      return 'bunzip2: Data integrity error when decompressing';
    } else {
      throw e;
    }
  }
}

export async function getOrFetchParseData(
  matchId: number,
  url: string,
  extraData: ExtraData,
): Promise<{
  data: ParserMatch | undefined;
  skipParse: boolean;
  error: string | null;
}> {
  const saved = await readParseData(matchId);
  if (saved) {
    redisCount(redis, 'reparse');
    if (config.DISABLE_REPARSE) {
      // If high load, we can disable parsing already parsed matches
      return { data: saved, skipParse: true, error: null };
    }
  }
  const error = await saveParseData(matchId, url, extraData);
  if (error) {
    return { data: undefined, skipParse: false, error };
  }
  const result = await readParseData(matchId);
  if (!result) {
    throw new Error('[PARSEDATA]: Could not get data for match ' + matchId);
  }
  return { data: result, skipParse: false, error };
}

export async function checkIsParsed(matchId: number) {
  return Boolean(
    (
      await db.raw('select match_id from parsed_matches where match_id = ?', [
        matchId,
      ])
    ).rows[0],
  );
}
