// Get a match ID with a high number of retries from player_match_history
// It probably doesn't have apidata
// Call fetchDataFromSeqNumApi on it
import { apiFetcher } from "./fetcher/ApiFetcher.ts";
import db from "./store/db.ts";
import { reconcileMatch } from "./util/reconcileUtil.ts";
import { runInLoop } from "./util/utility.ts";

runInLoop(async function repair() {
    // Disabled until backfill complete
    return;
    const { rows } = await db.raw('select match_id, retries from player_match_history ORDER BY retries DESC NULLS LAST LIMIT 1');
    const row = rows[0];
    if (row) {
        await apiFetcher.fetchDataFromSeqNumApi(row.match_id);
    }
    // Reconcile the match now that it's fixed
    let { rows: allRows } = await db.raw('select * from player_match_history where match_id = ?', [row.match_id]);
    console.log(allRows);
    // TODO enable when validated
    // await reconcileMatch(allRows);
}, 10000);
