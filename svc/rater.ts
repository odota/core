import { gcFetcher } from './fetcher/getGcData.ts';
import db from './store/db.ts';
import { average, isRadiant, redisCount } from './util/utility.ts';

const DEFAULT_RATING = 4000;
const kFactor = 32;

async function doRate() {
  while (true) {
    const { rows } = await db.raw<{
      rows: {
        match_seq_num: number;
        match_id: number;
        pgroup: PGroup;
        radiant_win: boolean;
        gcdata: GcMatch | null;
      }[];
    }>(
      'SELECT match_seq_num, match_id, pgroup, radiant_win, gcdata from rating_queue order by match_seq_num ASC LIMIT 1',
    );
    const row = rows[0];
    let gcMatch = row?.gcdata;
    if (!row || !gcMatch) {
      // No rows or no gcdata, wait and try again
      // Wait for prefetch to fill the match
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    // Get ratings of all players in the match, otherwise default value
    const accountIds = gcMatch.players.map((p) => p.account_id);
    // console.log(accountIds);
    const { rows: existingRatings } = await db.raw<{
      rows: { account_id: number; computed_mmr: number }[];
    }>(
      `SELECT account_id, computed_mmr FROM player_computed_mmr WHERE account_id IN (${accountIds.map((_) => '?').join(',')})`,
      [...accountIds],
    );
    const ratingMap = new Map<number, number>();
    existingRatings.forEach((r) => {
      ratingMap.set(r.account_id, r.computed_mmr);
    });
    // compute team averages
    const currRating1 = average(
      gcMatch.players
        .filter((p) => isRadiant(p))
        .map((p) => ratingMap.get(p.account_id!) ?? DEFAULT_RATING),
    );
    const currRating2 = average(
      gcMatch.players
        .filter((p) => !isRadiant(p))
        .map((p) => ratingMap.get(p.account_id!) ?? DEFAULT_RATING),
    );
    // apply elo formula to get delta
    const r1 = 10 ** (currRating1 / 400);
    const r2 = 10 ** (currRating2 / 400);
    const e1 = r1 / (r1 + r2);
    const e2 = r2 / (r1 + r2);
    const win1 = Number(row.radiant_win);
    const win2 = Number(!row.radiant_win);
    const ratingDiff1 = kFactor * (win1 - e1);
    const ratingDiff2 = kFactor * (win2 - e2);
    // Start transaction
    await db.raw('BEGIN TRANSACTION');
    // Rate each player
    console.log('match %s, radiant_win: %s', row.match_id, row.radiant_win);
    for (let i = 0; i < gcMatch.players.length; i++) {
      const p = gcMatch.players[i];
      const oldRating = ratingMap.get(p.account_id!) ?? DEFAULT_RATING;
      const delta = isRadiant(p) ? ratingDiff1 : ratingDiff2;
      // apply delta to each player (all players on a team will have the same rating change)
      const newRating = oldRating + delta;
      console.log(
        'account_id: %s, oldRating: %s, newRating: %s, delta: %s',
        p.account_id,
        oldRating,
        newRating,
        delta,
      );
      // Write ratings back to players
      await db.raw(
        'INSERT INTO player_computed_mmr(account_id, computed_mmr) VALUES(?, ?) ON CONFLICT(account_id) DO UPDATE SET computed_mmr = EXCLUDED.computed_mmr',
        [p.account_id, newRating],
      );
    }
    // Delete row
    await db.raw(
      'DELETE FROM rating_queue WHERE match_seq_num = ?',
      row.match_seq_num,
    );
    // Commit transaction
    await db.raw('COMMIT');
    redisCount('rater');
  }
}

async function prefetchGcData() {
  while (true) {
    // Find next row in the queue that doesn't have gcdata
    const { rows } = await db.raw<{
      rows: { match_seq_num: number; match_id: number; pgroup: PGroup }[];
    }>(
      'SELECT match_seq_num, match_id, pgroup from rating_queue WHERE gcdata IS NULL ORDER BY match_seq_num LIMIT 1',
    );
    const row = rows[0];
    if (!row) {
      // No rows, wait and try again
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    // Attempt to fetch
    const { data } = await gcFetcher.getOrFetchDataWithRetry(row.match_id, {
      pgroup: row.pgroup,
    }, 200);
    if (data) {
      // If successful, update
      await db.raw(
        'UPDATE rating_queue SET gcdata = ? WHERE match_seq_num = ?',
        [JSON.stringify(data), row.match_seq_num],
      );
    } else {
      // Match can't be rated due to lack of data
      await db.raw(
        'DELETE FROM rating_queue WHERE match_seq_num = ?',
        row.match_seq_num,
      );
      redisCount('rater_skip');
    }
  }
}

doRate();
prefetchGcData();
