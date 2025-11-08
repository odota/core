/**
 * Reconciles data for anonymous players.
 * We don't update player_caches for anonymous players on insert.
 * This service reads the list of players' matches collected from fullhistory, gcdata, and parse steps.
 * It checks our own database and updates player_caches so these matches get associated with the player.
 */
import db from './store/db.ts';
import { reconcileMatch } from './util/reconcileUtil.ts';
import { runInLoop } from './util/utility.ts';

runInLoop(async function reconcile() {
  // Fetch rows for a single match (could be multiple players to fill)
  const { rows }: { rows: HistoryType[] } = await db.raw(
    'UPDATE player_match_history SET retries = coalesce(retries, 0) + 1 WHERE match_id = (SELECT match_id FROM player_match_history ORDER BY retries ASC NULLS FIRST LIMIT 1) RETURNING *',
  );
  const first = rows[0];
  if (!first) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return;
  }
  console.log(first.match_id, first.retries);
  await reconcileMatch(rows, first.retries >= 5);
}, 0);
