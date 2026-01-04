/**
 * Reconciles data for anonymous players.
 * We don't update player_caches for anonymous players on insert.
 * This service reads the list of players' matches collected from fullhistory, gcdata, and parse steps.
 * It checks our own database and updates player_caches so these matches get associated with the player.
 */
import db from "./store/db.ts";
import { reconcileMatch } from "./util/reconcileUtil.ts";
import { runInLoop } from "./store/queue.ts";

await runInLoop(async function reconcile() {
  const result = await db.raw(
    "SELECT match_id FROM player_match_history ORDER BY retries ASC NULLS FIRST LIMIT 20",
  );
  if (!result.rows.length) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }
  // If there are multiple player rows for the match they could be the same ID
  const dedupIds = [
    ...new Set<number>(result.rows.map((r: any) => Number(r.match_id))),
  ];
  console.log(dedupIds);
  await Promise.all(
    dedupIds.map(async (matchId) => {
      // Fetch rows for a single match (could be multiple players to fill)
      const { rows }: { rows: HistoryType[] } = await db.raw(
        "UPDATE player_match_history SET retries = coalesce(retries, 0) + 1 WHERE match_id = ? RETURNING *",
        [matchId],
      );
      if (!rows.length) {
        // await new Promise(resolve => setTimeout(resolve, 1000));
        return;
      }
      console.log("%s: %s rows", matchId, rows.length);
      const shouldRepair = rows.every((row) => row.retries >= 5);
      await reconcileMatch(rows, shouldRepair);
    }),
  );
}, 0);
