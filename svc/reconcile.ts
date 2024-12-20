/**
 * Reconciles data for anonymous players.
 * We don't update player_caches for anonymous players on insert.
 * This service reads the list of players' matches collected from fullhistory, gcdata, and parse steps.
 * It checks our own database and updates player_caches so these matches get associated with the player.
 */
import { invokeIntervalAsync } from "../util/utility";
import db from "../store/db";
import { upsertPlayerCaches } from "../util/insert";
import { getPGroup } from "../util/pgroup";
import { getMatchDataFromBlobWithMetadata } from "../util/buildMatch";

type RowType = {account_id: number, match_id: number, player_slot: number};

async function doReconcile() {
  // Fetch rows for a single match (could be multiple players to fill)
  const { rows }: { rows: RowType[] } = await db.raw('SELECT * from player_match_history WHERE match_id = (SELECT match_id FROM player_match_history TABLESAMPLE SYSTEM_ROWS(1))');
  // optional: Verify each player/match combination doesn't exist in player_caches (or we have parsed data to update)
  const [match] = await getMatchDataFromBlobWithMetadata(rows[0].match_id);
  if (!match) {
    // Note: unless we backfill, we have limited API data for old matches (pre-2019ish)
    return;
  }
  const pgroup = getPGroup(match);
  // If reconciling after fullhistory, the pgroup won't contain account_id info. Add it.
  rows.forEach(r => {
    if (!pgroup[r.player_slot]?.account_id) {
      pgroup[r.player_slot].account_id = r.account_id;
    }
  });
  const targetSlots = new Set(rows.map(r => r.player_slot));
  // Filter to only players that we want to fill in
  match.players = match.players.filter(p => targetSlots.has(p.player_slot));
  if (!match.players.length) {
    return;
  }
  // Call upsertPlayerCaches: pgroup will be used to populate account_id and heroes fields (for peers search)
  const result = await upsertPlayerCaches(match, undefined, pgroup, 'reconcile');
  if (result.every(Boolean)) {
    // Delete the rows since we successfully updated
    await Promise.all(rows.map(async (row) => {
      return db.raw('DELETE FROM player_match_history WHERE account_id = ? AND match_id = ?', [row.account_id, row.match_id]);
    }));
  }
}

invokeIntervalAsync(doReconcile, 1000);
