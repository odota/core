import * as allFetchers from '../fetcher/allFetchers.ts';
import db from '../store/db.ts';
import { getMatchBlob } from './getMatchBlob.ts';
import { upsertPlayerCaches } from './insert.ts';
import { getPGroup } from './pgroup.ts';
import { redisCount } from './utility.ts';

export async function queueReconcile(
  gcMatch: GcMatch | null,
  pgroup: PGroup,
  metricName: MetricName,
) {
  if (gcMatch) {
    // Log the players who were previously anonymous for reconciliation
    await Promise.all(
      gcMatch.players
        .filter((p) => !Boolean(pgroup[p.player_slot]?.account_id))
        .map(async (p) => {
          if (p.account_id) {
            const { rows } = await db.raw(
              'INSERT INTO player_match_history(account_id, match_id, player_slot) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING *',
              [p.account_id, gcMatch.match_id, p.player_slot],
            );
            if (rows.length > 0) {
              await redisCount(metricName);
            }
          }
        }),
    );
  }
}

export async function reconcileMatch(rows: HistoryType[]) {
  // validate that all rows have the same match ID
  const set = new Set(rows.map((r) => r.match_id));
  if (set.size > 1) {
    throw new Error('multiple match IDs found in input to reconcileMatch');
  }
  // optional: Verify each player/match combination doesn't exist in player_caches (or we have parsed data to update)
  const [match] = await getMatchBlob(rows[0].match_id, allFetchers);
  if (!match) {
    // Note: unless we backfill, we have limited API data for old matches
    // For more recent matches we're more likely to have data
    // Maybe we can mark the more recent matches with a flag
    // Or queue up recent matches from fullhistory and process them in order so fh requests show updates quicker
    return;
  }
  // Update the league to match index (if available)
  if ('leagueid' in match && match.leagueid) {
    await db.raw('INSERT INTO league_match(leagueid, match_id) VALUES(?, ?) ON CONFLICT DO NOTHING', [match.leagueid, match.match_id]);
  }
  const pgroup = getPGroup(match);
  // If reconciling after fullhistory, the pgroup won't contain account_id info. Add it.
  rows.forEach((r) => {
    if (!pgroup[r.player_slot]?.account_id) {
      pgroup[r.player_slot].account_id = r.account_id;
    }
  });
  const targetSlots = new Set(rows.map((r) => r.player_slot));
  // Filter to only players that we want to fill in
  match.players = match.players.filter((p) => targetSlots.has(p.player_slot));
  if (!match.players.length) {
    return;
  }
  // Call upsertPlayerCaches: pgroup will be used to populate account_id and heroes fields (for peers search)
  const result = await upsertPlayerCaches(
    match,
    undefined,
    pgroup,
    'reconcile',
  );
  if (result.every(Boolean)) {
    // Delete the rows since we successfully updated
    await Promise.all(
      rows.map(async (row) => {
        return db.raw(
          'DELETE FROM player_match_history WHERE account_id = ? AND match_id = ?',
          [row.account_id, row.match_id],
        );
      }),
    );
  }
}
