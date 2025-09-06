// Get a match ID with a high number of retries from player_match_history
// It probably doesn't have apidata
// Call fetchDataFromSeqNumApi on it
import { apiFetcher } from "./fetcher/getApiData.ts";
import db from "./store/db.ts";
import { reconcileMatch } from "./util/reconcileUtil.ts";

async function doRepair() {
    const { rows } = await db.raw('select match_id, retries from player_match_history TABLESAMPLE SYSTEM_ROWS(1) WHERE retries >= 10');
    // select match_id, retries from player_match_history WHERE retries > 5 ORDER BY random() limit 1
    const row = rows[0];
    if (row) {
        await apiFetcher.fetchDataFromSeqNumApi(row.match_id);
    }
    // Reconcile the match now that it's fixed
    let { rows: allRows } = await db.raw('select * from player_match_history where match_id = ?', [row.match_id]);
    console.log(allRows);
    // await reconcileMatch(allRows);
    await new Promise(resolve => setTimeout(resolve, 1000));
}
doRepair();
