/**
 * Reconciles data for anonymous players.
 * We don't update player_caches for anonymous players on insert.
 * This service reads the list of players' matches collected from fullhistory, gcdata, and parse steps.
 * It checks our own database and updates player_caches so these matches get associated with the player.
 */
import { invokeIntervalAsync } from "../util/utility";
import { buildMatch } from '../util/buildMatch';
import db from "../store/db";
import { upsertPlayerCaches } from "../util/insert";
import { getPGroup } from "../util/pgroup";

async function doReconcile() {
  // Fetch top rows (ordered by account_id, match_id)
  const { rows }: { rows: {account_id: number, match_id: number, player_slot: number}[] } = await db.raw('SELECT * from player_match_history ORDER BY account_id, match_id LIMIT 10');
  // buildMatch does some unnecessary lookups like player names
  await Promise.all(rows.map(async (row) => {
    // TODO Verify the player/match combination doesn't exist in player_caches (or we have parsed data to update)
    // Fetch the match
    const match = await buildMatch(row.match_id, {});
    if (!match) {
      return;
    }
    const pgroup = getPGroup(match);
    // Filter to only target player
    match.players = match?.players.filter(p => p.player_slot === row.player_slot);
    if (!match.players.length) {
      return;
    }
    // Call upsertPlayerCaches with a single player match
    // If we pass pgroup, this will populate account_id automatically
    const result = await upsertPlayerCaches(match, undefined, pgroup, 'reconcile');
    if (result.every(Boolean)) {
      // Delete the row since we successfully updated (enable when we actually start reconciling)
      await db.raw('DELETE FROM player_match_history WHERE account_id = ? AND match_id = ?', [row.account_id, row.match_id]);
    }
  }));
}

// invokeIntervalAsync(doReconcile, 10000);
