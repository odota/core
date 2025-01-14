/**
 * Reconciles data for anonymous players.
 * We don't update player_caches for anonymous players on insert.
 * This service reads the list of players' matches collected from fullhistory, gcdata, and parse steps.
 * It checks our own database and updates player_caches so these matches get associated with the player.
 */
import db from "../store/db";
import { reconcileMatch } from "../util/reconcileMatch";
import type { HistoryType } from "../util/types";

async function doReconcile() {
  while (true) {
    // Fetch rows for a single match (could be multiple players to fill)
    const { rows }: { rows: HistoryType[] } = await db.raw('SELECT * from player_match_history WHERE match_id = (SELECT match_id FROM player_match_history TABLESAMPLE SYSTEM_ROWS(1))');
    if (rows[0].match_id < 7500000000) {
      // Old match so we probably don't have data (until backfilled)
      // We still might have data, so process it with some probability
      // If not processed, retry with short interval
      if (Math.random() < 0.9) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
    }
    await reconcileMatch(rows);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
doReconcile();