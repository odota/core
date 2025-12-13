// Get a match ID with a high number of retries from player_match_history
// It probably doesn't have apidata, so backfill it with seqnum data
import { apiFetcher } from "./fetcher/allFetchers.ts";
import db from "./store/db.ts";
import { reconcileMatch } from "./util/reconcileUtil.ts";
import { runInLoop } from "./util/utility.ts";

runInLoop(async function repair() {
  const { rows } = await db.raw(
    "select match_id, retries from player_match_history WHERE retries >= 5 ORDER BY retries DESC NULLS LAST LIMIT 1",
  );
  const row = rows[0];
  if (row) {
    await apiFetcher.getOrFetchData(row.match_id, { seqNumBackfill: true });
    // Reconcile the match now that it's fixed
    let { rows: allRows } = await db.raw(
      "select * from player_match_history where match_id = ?",
      [row.match_id],
    );
    console.log(allRows);
    await reconcileMatch(allRows, true);
  }
}, 1000);
