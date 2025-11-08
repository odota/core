import * as allFetchers from '../fetcher/allFetchers.ts';
import db from '../store/db.ts';
import { getMatchBlob } from './getMatchBlob.ts';
import { upsertPlayerCaches } from './insert.ts';
import { getPGroup } from './pgroup.ts';
import { redisCount } from './utility.ts';

const apiFetcher = allFetchers.apiFetcher;

export async function queueReconcile(
  gcMatch: GcData | null,
  pgroup: PGroup,
  metricName: MetricName,
) {
  if (gcMatch) {
    // Log the players who were previously anonymous for reconciliation
    const trx = await db.transaction();
    await Promise.all(
      gcMatch.players
        // .filter((p) => !Boolean(pgroup[p.player_slot]?.account_id))
        .map(async (p) => {
          if (p.account_id) {
            const { rows } = await trx.raw(
              'INSERT INTO player_match_history(account_id, match_id, player_slot) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING *',
              [p.account_id, gcMatch.match_id, p.player_slot],
            );
            if (rows.length > 0) {
              await redisCount(metricName);
            }
          }
        }),
    );
    await trx.commit();
  }
}

export async function reconcileMatch(rows: HistoryType[], attemptRepair = false) {
  // validate that all rows have the same match ID
  const set = new Set(rows.map((r) => r.match_id));
  if (set.size > 1) {
    throw new Error('multiple match IDs found in input to reconcileMatch');
  }
  // optional: Verify each player/match combination doesn't exist in player_caches (or we have parsed data to update)
  let [match] = await getMatchBlob(rows[0].match_id, allFetchers);
  if (!match && attemptRepair) {
    console.log('[RECONCILE] attempting repair for %s', rows[0].match_id);
    await apiFetcher.getOrFetchData(rows[0].match_id, { seqNumBackfill: true });
    [match] = await getMatchBlob(rows[0].match_id, allFetchers);
  }
  if (!match) {
    console.log('[RECONCILE] no API data for %s', rows[0].match_id);
    return;
  }
  // Update the league to match index (if available)
  if ('leagueid' in match && match.leagueid) {
    await db.raw(
      'INSERT INTO league_match(leagueid, match_id) VALUES(?, ?) ON CONFLICT DO NOTHING',
      [match.leagueid, match.match_id],
    );
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
    const trx = await db.transaction();
    // Delete the rows since we successfully updated
    await Promise.all(
      rows.map(async (row) => {
        return trx.raw(
          'DELETE FROM player_match_history WHERE account_id = ? AND match_id = ?',
          [row.account_id, row.match_id],
        );
      }),
    );
    await trx.commit();
  }
}
