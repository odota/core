// Fetches new matches from the Steam API using the sequential endpoint
import config from "../config.ts";
import { redisCount } from "./store/redis.ts";
import { runInLoop } from "./util/utility.ts";
import db from "./store/db.ts";
import { getSteamAPIDataWithRetry, SteamAPIUrls } from "./util/http.ts";

const PAGE_SIZE = 100;
// This endpoint is limited to something like 1 request every 5 seconds
const SCANNER_WAIT = 5000;
const isSecondary = Boolean(Number(config.SCANNER_OFFSET));
const offset = Number(config.SCANNER_OFFSET);
let nextSeqNum = Math.max(
  (await getCurrentSeqNum()) - (isSecondary ? offset : 0),
  0,
);

if (config.NODE_ENV === "development" && !nextSeqNum) {
  // Never do this in production to avoid skipping sequence number if we didn't pull .env properly
  const url = SteamAPIUrls.api_history({});
  // Just get the approximate current seq num
  const data = await getSteamAPIDataWithRetry<MatchHistory>({ url });
  nextSeqNum = data.result.matches[0].match_seq_num;
}

await runInLoop(async function scanApi() {
  if (isSecondary) {
    const currSeqNum = await getCurrentSeqNum();
    console.log(
      "secondary scanner offset %s/%s",
      currSeqNum - nextSeqNum,
      offset,
    );
    if (currSeqNum - nextSeqNum < offset) {
      // Secondary scanner is catching up too much. Wait and try again
      console.log("secondary scanner waiting");
      await new Promise((resolve) => setTimeout(resolve, SCANNER_WAIT));
      return;
    }
  }
  const url = SteamAPIUrls.api_sequence({
    start_at_match_seq_num: nextSeqNum,
    matches_requested: PAGE_SIZE,
  });
  let data = await getSteamAPIDataWithRetry<MatchSequence>({
    url,
    proxy: true,
  });
  const resp = data?.result?.matches ?? [];
  console.log("[API] match_seq_num:%s, matches:%s", nextSeqNum, resp.length);
  const start = Date.now();
  await Promise.all(
    resp.map(async (match: ApiData) => {
      // Optionally throttle inserts to prevent overload
      if (match.match_id % 100 >= Number(config.SCANNER_PERCENT)) {
        return;
      }
      const { rows } = await db.raw(
        "INSERT INTO insert_queue(match_seq_num, data) VALUES(?, ?) ON CONFLICT DO NOTHING RETURNING match_seq_num",
        [match.match_seq_num, JSON.stringify(match)],
      );
      if (rows[0]) {
        if (isSecondary) {
          redisCount("secondary_scanner");
        }
      }
    }),
  );
  const end = Date.now();
  console.log("write: %dms", end - start);
  if (resp.length) {
    nextSeqNum = resp[resp.length - 1].match_seq_num + 1;
    console.log("next_seq_num: %s", nextSeqNum);
  }
  // If not a mostly full page, wait full interval
  // This is sometimes 99 now since Valve is hiding high MMR matches
  const adjustedWait = resp.length < PAGE_SIZE * 0.9 ? SCANNER_WAIT : 0;
  await new Promise((resolve) => setTimeout(resolve, adjustedWait));
}, 0);

async function getCurrentSeqNum(): Promise<number> {
  const result = await db.raw("select max(match_seq_num) from insert_queue;");
  return Number(result.rows[0]?.max) || 0;
}
