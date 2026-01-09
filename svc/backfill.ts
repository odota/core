// Fetches old matches from Steam API and writes to blob storage
import { blobArchive } from "./store/archive.ts";
import { runInLoop } from "./store/queue.ts";
import redis from "./store/redis.ts";
import { SteamAPIUrls, getSteamAPIDataWithRetry } from "./util/http.ts";
import { transformMatch } from "./util/compute.ts";
import db from "./store/db.ts";

// Missing match ID analysis
// select (match_id / 100000000) grp, count(1) from player_match_history where retries >= 5 group by grp;
//  grp |  count
// -----+---------
//    0 |   64804
//    1 |   68286
//    2 |  114073
//    3 |  112484
//    4 |   93010
//    5 |  108361
//    6 |  115609
//    7 |  133194
//    8 |  149692
//    9 |  132428
//   10 |  134958
//   11 |  133906
//   12 |  126582
//   13 |  153738
//   14 |  153659
//   15 |  169391
//   16 |  186263
//   17 |  216429
//   18 |  195929
//   19 |  254067
//   20 |  320508
//   21 |  866071
//   22 | 1091257
//   23 |  988286
//   24 |  920247
//   25 |  759031
//   26 |  970335
//   27 |  943799
//   28 |  920999
//   29 |  932538
//   30 |  973591
//   31 |  751198
//   32 |  629940
//   33 |  618207
//   34 |  585039
//   35 |  531522
//   36 |  626969
//   37 |  565435
//   38 |  479694
//   39 |  485414
//   40 |  505514
//   41 |  594692
//   42 |  649971
//   43 |  508703
//   44 |  255335
//   45 |  233631
//   46 |  214047
//   47 |  199779
//   48 |  253901
//   49 |  350719
//   50 |  327131
//   51 |  169665
//   52 |  144039
//   53 |  137387
//   54 |  126694
//   55 |  133386
//   56 |  150484
//   57 |  165415
//   58 |  123568
//   59 |  103420
//   71 |   20874
//   72 |  119428
//   73 |  127361
//   75 |   15794
//   76 |   26695
//   77 |  650136
//   78 |   33860
//   79 |   10918
//   80 |   44460
//   81 |     398
//   82 |      74
//   83 |     203
//   84 |     216
//   85 |      44
const stop = Number(process.env.BACKFILL_STOP);

await runInLoop(async function backfill() {
  // This endpoint is limited to something like 1 request every 5 seconds
  // get progress from redis if available, if not, fallback to file
  let seqNum = 0;
  if (redis) {
    seqNum =
      Number(await redis.get("backfill:" + process.env.BACKFILL_START)) ||
      Number(process.env.BACKFILL_START);
  }
  if (seqNum > stop) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.exit(0);
  }
  // const begin = Date.now();
  const url = SteamAPIUrls.api_sequence({
    start_at_match_seq_num: seqNum,
    matches_requested: 100,
  });
  let data = null;
  data = await getSteamAPIDataWithRetry<MatchSequence>({
    url,
    proxy: true,
  });
  const resp =
    data && data.result && data.result.matches ? data.result.matches : [];
  console.log("[API] match_seq_num:%s, matches:%s", seqNum, resp.length);
  // write to blobstore, process the blob using same function as insertMatch
  for (let origMatch of resp) {
    // Check if match is in player_match_history table
    const { rows } = await db.raw(
      "select match_id from player_match_history where match_id = ? and retries >= 5;",
      [origMatch.match_id],
    );
    if (rows[0]) {
      const match = transformMatch(origMatch);
      await blobArchive.archivePut(
        match.match_id + "_api",
        Buffer.from(JSON.stringify(match)),
        true,
      );
    }
  }
  if (resp.length) {
    const nextSeqNum = resp[resp.length - 1].match_seq_num + 1;
    console.log("next_seq_num: %s", nextSeqNum);
    // Completed inserting matches on this page so update
    if (redis) {
      await redis.set(
        "backfill:" + process.env.BACKFILL_START,
        nextSeqNum.toString(),
      );
    }
  }
}, 0);
