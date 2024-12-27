/**
 * Reconciles data for anonymous players.
 * We don't update player_caches for anonymous players on insert.
 * This service reads the list of players' matches collected from fullhistory, gcdata, and parse steps.
 * It checks our own database and updates player_caches so these matches get associated with the player.
 */
import { invokeIntervalAsync } from "../util/utility";
import db from "../store/db";
import { HistoryType, reconcileMatch } from "../util/insert";

async function doReconcile() {
  // Fetch rows for a single match (could be multiple players to fill)
  const { rows }: { rows: HistoryType[] } = await db.raw('SELECT * from player_match_history WHERE match_id = (SELECT match_id FROM player_match_history TABLESAMPLE SYSTEM_ROWS(1))');
  await reconcileMatch(rows);
}

invokeIntervalAsync(doReconcile, 500);
