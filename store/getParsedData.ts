import config from '../config';
import { redisCount } from '../util/utility';
import cassandra from './cassandra';
import db from './db';
import { insertMatch } from './insert';
import redis from './redis';
import { promisify } from 'util';
import { exec } from 'child_process';

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
async function saveParseData(
  matchId: number,
  url: string,
  { leagueid, start_time, duration, origin, pgroup }: ExtraData,
): Promise<void> {
  console.log('[PARSER] parsing replay at:', url);
  const { stdout } = await execPromise(
    `curl --max-time 60 --fail -L ${url} | ${
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
}

/**
 * Checks to see a match has been parsed.
 * Does the parse if not.
 * @param matchId
 * @param url
 * @param extraData
 * @returns Whether the parse was actually done
 */
export async function maybeFetchParseData(
  matchId: number,
  url: string,
  extraData: ExtraData,
): Promise<boolean> {
  // Check if match is already parsed
  const isParsed = Boolean(
    (
      await db.raw('select match_id from parsed_matches where match_id = ?', [
        matchId,
      ])
    ).rows[0],
  );
  if (isParsed) {
    redisCount(redis, 'reparse');
    if (config.DISABLE_REPARSE) {
      // If high load, we can disable parsing already parsed matches
      return false;
    }
  }
  // If we got here we don't have it saved or want to refetch
  await saveParseData(matchId, url, extraData);
  return true;
}
