import type { HistoryType } from "./types";
import db from '../store/db';
import { getPGroup } from "./pgroup";
import { upsertPlayerCaches } from "./playerCaches";
import { getMatchDataFromBlobWithMetadata } from "./buildMatch";

export async function reconcileMatch(rows: HistoryType[]) {
  // validate that all rows have the same match ID
  const set = new Set(rows.map(r => r.match_id));
  if (set.size > 1) {
    throw new Error('multiple match IDs found in input to reconcileMatch');
  }
  // optional: Verify each player/match combination doesn't exist in player_caches (or we have parsed data to update)
  const [match] = await getMatchDataFromBlobWithMetadata(rows[0].match_id);
  if (!match) {
    // Note: unless we backfill, we have limited API data for old matches
    // For more recent matches we're more likely to have data
    // Maybe we can mark the more recent matches with a flag
    // Or queue up recent matches from fullhistory and process them in order so fh requests show updates quicker
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