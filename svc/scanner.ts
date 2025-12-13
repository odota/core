// Fetches new matches from the Steam API using the sequential endpoint
import config from "../config.ts";
import redis, { redisCount } from "./store/redis.ts";
import { insertMatch } from "./util/insert.ts";
import { runInLoop } from "./util/utility.ts";
import db from "./store/db.ts";
import { cacheTrackedPlayers } from "./util/queries.ts";
import { getSteamAPIDataWithRetry, SteamAPIUrls } from "./util/http.ts";

const PAGE_SIZE = 100;
// This endpoint is limited to something like 1 request every 5 seconds
const SCANNER_WAIT = 5000;
const isSecondary = Boolean(Number(config.SCANNER_OFFSET));
const offset = Number(config.SCANNER_OFFSET);
let nextSeqNum: number;

if (config.NODE_ENV === "development") {
  let numResult = await getCurrentSeqNum();
  if (!numResult) {
    // Never do this in production to avoid skipping sequence number if we didn't pull .env properly
    const url = SteamAPIUrls.api_history({});
    // Just get the approximate current seq num
    const data = await getSteamAPIDataWithRetry<MatchHistory>({ url });
    numResult = data.result.matches[0].match_seq_num;
    await db.raw(
      "INSERT INTO last_seq_num(match_seq_num) VALUES (?) ON CONFLICT DO NOTHING",
      [numResult],
    );
  }
}
// Make sure we have tracked players loaded
const trackedExists = await redis.exists("tracked");
if (!trackedExists) {
  await cacheTrackedPlayers();
}
runInLoop(async function scanApi() {
  // If primary (offset 0) or first secondary iteration, read value from storage
  // If secondary, use the nextseqnum value from previous iteration
  const current = await getCurrentSeqNum();
  let seqNum = current - offset;
  if (isSecondary && nextSeqNum) {
    if (nextSeqNum > seqNum) {
      // Secondary scanner is catching up too much. Wait and try again
      console.log("secondary scanner waiting", seqNum, current, offset);
      await new Promise((resolve) => setTimeout(resolve, SCANNER_WAIT));
      return;
    } else {
      seqNum = nextSeqNum;
    }
  }
  // const start = Date.now();
  const url = SteamAPIUrls.api_sequence({
    start_at_match_seq_num: seqNum,
    matches_requested: PAGE_SIZE,
  });
  let data = await getSteamAPIDataWithRetry<MatchSequence>({
    url,
    proxy: true,
  });
  const resp = data?.result?.matches ?? [];
  console.log("[API] match_seq_num:%s, matches:%s", seqNum, resp.length);
  const start = Date.now();
  await Promise.all(
    resp.map(async (match: ApiData) => {
      // Optionally throttle inserts to prevent overload
      if (match.match_id % 100 >= Number(config.SCANNER_PERCENT)) {
        return;
      }
      // check if match was previously processed
      const result = await redis.zscore("scanner_insert", match.match_id);
      // console.log(match.match_id, result);
      // don't insert this match if we already processed it recently
      if (!result) {
        if (isSecondary) {
          // On secondary, don't insert if no min value or too far behind
          const minInRange = Number(
            (await redis.zrange("scanner_insert", 0, 0))[0],
          );
          if (!minInRange || match.match_id < minInRange) {
            return;
          }
          // secondary scanner picked up a missing match
          redisCount("secondary_scanner");
        }
        await insertMatch(match, {
          type: "api",
          origin: "scanner",
        });
        await redis.zadd("scanner_insert", match.match_id, match.match_id);
        // To avoid dups we should always keep more matches here than SCANNER_OFFSET
        await redis.zremrangebyrank("scanner_insert", "0", "-100001");
      }
    }),
  );
  const end = Date.now();
  console.log("insert: %dms", end - start);
  // Completed inserting matches on this page so update redis
  if (resp.length) {
    nextSeqNum = resp[resp.length - 1].match_seq_num + 1;
    console.log("next_seq_num: %s", nextSeqNum);
    if (!isSecondary) {
      // Only set match seq num on primary
      await db.raw(
        "INSERT INTO last_seq_num(match_seq_num) VALUES (?) ON CONFLICT DO NOTHING",
        [nextSeqNum],
      );
    }
  }
  // const end = Date.now();
  // const elapsed = end - start;
  // If not a mostly full page, wait full interval
  // This is sometimes 99 now since Valve is hiding high MMR matches
  const adjustedWait = resp.length < PAGE_SIZE * 0.9 ? SCANNER_WAIT : 0;
  await new Promise((resolve) => setTimeout(resolve, adjustedWait));
}, 0);

async function getCurrentSeqNum(): Promise<number> {
  const result = await db.raw("select max(match_seq_num) from last_seq_num;");
  return Number(result.rows[0]?.max) || 0;
}
