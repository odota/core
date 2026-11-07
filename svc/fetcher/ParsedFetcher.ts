import { blobArchive } from "../store/archive.ts";
import db from "../store/db.ts";
import { insertMatch } from "../util/insert.ts";
import { MatchFetcherBase } from "./MatchFetcherBase.ts";
import config from "../../config.ts";
import { getRandomParserUrl } from "../util/registry.ts";

export class ParsedFetcher extends MatchFetcherBase<ParsedData> {
  savedDataMetricName: MetricName = "reparse";
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
      const headResp = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      });
      if (!headResp.ok) {
        return { data: null, error: "Replay not found" };
      }
    } catch (e: any) {
      console.log(e.message);
      return { data: null, error: "Replay not found" };
    }

    // Pipelined for efficiency, but timings:
    // DL: 2967ms (curl http://replay152.valve.net/570/7503212404_1277518156.dem.bz2)
    // bunzip: 6716ms (bunzip2 7503212404_1277518156.dem.bz2)
    // parse: 9407ms (curl -X POST --data-binary "@7503212404_1277518156.dem" odota-parser:5600 > output.log)
    // process: 3278ms (node processors/createParsedDataBlob.mjs < output.log)
    const parseUrl = await getRandomParserUrl(`/blob?replay_url=${url}`);
    console.log("[PARSER]", parseUrl);
    const resp = await fetch(parseUrl, {
      signal: AbortSignal.timeout(300000),
    });
    // Throw if the http response is 4xx or 5xx (and not consume an attempt)
    if (!resp.ok) {
      throw new Error(`Parser response not ok: ${resp.status}`);
    }
    const text = await resp.text();
    const parseData: ParsedData | null = text ? JSON.parse(text) : null;
    if (!parseData) {
      // Otherwise, it's an expected error so we should use an attempt
      console.log("[STATUS]", resp.status);
      return {
        data: null,
        error: `No parse data in ${resp.status} response (probably expected error)`,
      };
    }
    const result: ParsedData = {
      ...parseData,
      match_id: matchId,
      leagueid,
      // start_time and duration used for calculating dust adjustments and APM
      start_time,
      duration,
    };
    await insertMatch(result, {
      type: "parsed",
      origin,
      pgroup,
      endedAt: start_time + duration,
    });
    return { data: result, error: null };
  };
  checkAvailable = async (matchId: number) => {
    return Boolean(
      (
        await db.raw("select match_id from parsed_matches where match_id = ?", [
          matchId,
        ])
      ).rows[0],
    );
  };
}
